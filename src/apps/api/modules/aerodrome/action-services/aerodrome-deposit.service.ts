import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { chainsConfig } from '../../../../../common/constants/chains';
import { Address, erc20Abi, formatUnits, getContract, parseUnits } from 'viem';
import { isNumber } from 'class-validator';
import { getPoolsDataKey } from '../../cache/constants/keys';
import { ITokenInfo, PoolData } from '../../../../../common/types';
import { MINUTE } from '../../../../../common/constants/time';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import { getBalance, getTransactionReceipt, readContract } from 'viem/actions';
import { formatUsd } from '../../../../../common/utils/format-usd';
import { CacheService } from '../../cache/cache.service';
import { ViemService } from '../../viem/viem.service';
import { AerodromeService } from '../aerodrome.service';
import { clEstimatorAbi as slipstreamSugarAbi } from '../../../../../common/constants/chains/abis/cl-estimator.abi';
import { calculateTicks } from '../../../../../common/utils/calculate-ticks';
import { TICK_RANGES } from '../../../../../common/constants/tick-ranges';
import { routerAbi } from '../../../../../common/constants/chains/abis/router.abi';
import { TokensService } from '../../tokens/tokens.service';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { PrivyService } from '../../privy/privy.service';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';

@Injectable()
export class AerodromeDepositService {
  private readonly logger = new Logger(AerodromeDepositService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
    private readonly tokensService: TokensService,
    private readonly aerodromeService: AerodromeService,
    private readonly privyService: PrivyService,
  ) {}

  async addLiquidityToLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    symbol: string,
    tokenIn: string,
    amount: number,
    isSimulation = true,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { router } = chainsConfig[chainId];

    // region Calculations
    if (amount <= 0) {
      return {
        success: false,
        message:
          'Invalid deposit amount. Please enter a value greater than $0.',
      };
    }

    const addToLpIdForLogs = crypto.randomUUID();
    this.logger.log(
      `[Add liquidity: ${addToLpIdForLogs}]: Pool ${symbol}, Token In - ${tokenIn}. User: ${user.id}`,
    );

    if (tokenIn === 'ETH') {
      tokenIn = 'WETH';
    }

    const fromAddress = user.wallets.find((wallet) => wallet.isDefault)
      ?.address as Address | undefined;

    if (!fromAddress) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: Wallet not found`,
      );
      return {
        success: false,
        message: 'Wallet not found',
      };
    }

    this.logger.log(
      `[Add liquidity: ${addToLpIdForLogs}]: Wallet address: ${fromAddress}`,
    );

    const ethToken = await this.tokensService.getTokenBySymbol(
      'ETH',
      chainId,
      false,
      true,
      true,
    );

    if (!ethToken || isNumber(ethToken)) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: ETH token not found`,
      );
      return {
        success: false,
        message: 'ETH token not found',
      };
    }

    const ethPrice = +(ethToken?.price || 0);
    if (!ethToken) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: ETH price not found`,
      );
      return {
        success: false,
        message: 'ETH price not found',
      };
    }

    const poolsCacheKey = getPoolsDataKey(chainId);
    const pools = await this.cacheService.get<PoolData[]>(poolsCacheKey);

    if (!pools?.length) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: Pools not found`,
      );
      return {
        success: false,
        message: 'Pools not found',
      };
    }

    const pool = pools.find((p) =>
      p.symbol.toLowerCase().includes(symbol.toLowerCase()),
    );

    if (!pool) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: Liquidity pool not found`,
      );
      return {
        success: false,
        message: 'Liquidity pool not found',
      };
    }

    if (!pool.symbol.toLowerCase().includes(tokenIn.toLowerCase())) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: This token is not in this pool`,
      );
      return {
        success: false,
        message: 'This token is not in this pool',
      };
    }

    const stable = pool.type === 0;

    const token0Info = pool.token0Symbol
      ? await this.tokensService.getTokenBySymbol(
          pool.token0Symbol,
          chainId,
          false,
          true,
          true,
        )
      : null;

    const token1Info = pool.token1Symbol
      ? await this.tokensService.getTokenBySymbol(
          pool.token1Symbol,
          chainId,
          false,
          true,
          true,
        )
      : null;

    if (
      !token0Info ||
      !token1Info ||
      isNumber(token0Info) ||
      isNumber(token1Info)
    ) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: Token ${pool?.token0Symbol} or ${pool?.token1Symbol} not found`,
      );
      return {
        success: false,
        message: `Token ${pool?.token0Symbol} or ${pool?.token1Symbol} not found`,
      };
    }

    const tokensInfos = await this.assignTokensInfo(
      tokenIn,
      token0Info,
      token1Info,
      chainId,
    );

    if (!tokensInfos) {
      return {
        success: false,
        message: 'Cannot determine token in',
      };
    }

    const { tokenInInfo, tokenOutInfo } = tokensInfos;

    const token0Contract = getContract({
      address: tokenInInfo.address as Address,
      abi: erc20Abi,
      client: viemClient,
    });
    const token1Contract = getContract({
      address: tokenOutInfo.address as Address,
      abi: erc20Abi,
      client: viemClient,
    });

    const slippage = '5.0';

    let txHash: Address;

    const deadline = BigInt(Date.now() + 10 * MINUTE);

    const to = fromAddress;
    const shouldExecuteWithoutConfirmation =
      user.should_execute_actions_without_confirmation;

    const isEthPool =
      tokenInInfo.symbol.toUpperCase() === 'ETH' ||
      tokenOutInfo.symbol.toUpperCase() === 'ETH';
    const isFromEth = tokenInInfo.symbol.toUpperCase() === 'ETH';
    const isToEth = tokenOutInfo.symbol.toUpperCase() === 'ETH';
    let {
      amountADesiredBN,
      amountBDesiredBN,
      amountAMinBN,
      amountBMinBN,
      amountAToApproveBN,
      amountBToApproveBN,
      amountIn,
      amountOut,
    } = await this.computeAmounts(
      chainId,
      tokenInInfo,
      tokenOutInfo,
      amount,
      slippage,
      tokenIn,
      pool,
    );

    this.logger.log(
      `[Add liquidity: ${addToLpIdForLogs}]: Amount in: ${amountIn} ${tokenInInfo.symbol}, amount out: ${amountOut} ${tokenOutInfo.symbol}`,
    );
    this.logger.log(
      `[Add liquidity: ${addToLpIdForLogs}]: Amount A desired: ${amountADesiredBN}, amount B desired: ${amountBDesiredBN}`,
    );
    this.logger.log(
      `[Add liquidity: ${addToLpIdForLogs}]: Amount A min: ${amountAMinBN}, amount B min: ${amountBMinBN}`,
    );

    const token0Balance = !isFromEth
      ? await token0Contract.read.balanceOf([fromAddress as Address])
      : undefined;
    let shouldForceMax = false;

    if (
      token0Balance !== undefined &&
      tokenIn.toUpperCase() === tokenInInfo.symbol.toUpperCase()
    ) {
      const amountDiff =
        +token0Balance.toString() - +amountADesiredBN.toString();
      const balanceSlippage = +token0Balance.toString() * 0.01;
      shouldForceMax = Math.abs(amountDiff) < balanceSlippage;

      if (shouldForceMax) {
        this.logger.log(
          `[Add liquidity: ${addToLpIdForLogs}]: Forcing max amount in due to small difference (${amountDiff})`,
        );
        amount = +formatUnits(
          token0Balance - BigInt(Math.trunc(amountDiff)),
          tokenInInfo.decimals || 18,
        );
        const amounts = await this.computeAmounts(
          chainId,
          tokenInInfo,
          tokenOutInfo,
          amount,
          slippage,
          tokenIn,
          pool,
        );
        amountADesiredBN = token0Balance;
        amountBDesiredBN = amounts.amountBDesiredBN;
        amountAMinBN = amounts.amountAMinBN;
        amountBMinBN = amounts.amountBMinBN;
        amountAToApproveBN = amounts.amountAToApproveBN;
        amountBToApproveBN = amounts.amountBToApproveBN;
        amountIn = amounts.amountIn;
        amountOut = amounts.amountOut;
      }
    }
    if (token0Balance !== undefined && token0Balance < amountADesiredBN) {
      const expectedAmount = formatUnits(
        amountADesiredBN,
        tokenInInfo.decimals || 18,
      );
      const actualAmount = formatUnits(
        token0Balance,
        tokenInInfo.decimals || 18,
      );
      const diff = +expectedAmount - +actualAmount;
      return {
        success: false,
        message:
          `Balance of ${tokenInInfo.symbol} not enough.` +
          ` Expected ${expectedAmount} but got ${actualAmount}.` +
          ` Swap from any token to ${diff} ${tokenInInfo.symbol} is recommended.`,
      };
    }

    const token1Balance = !isToEth
      ? await token1Contract.read.balanceOf([fromAddress as Address])
      : undefined;
    if (
      token1Balance !== undefined &&
      tokenIn.toUpperCase() === tokenOutInfo.symbol.toUpperCase()
    ) {
      const amountDiff =
        +token1Balance.toString() - +amountBDesiredBN.toString();
      const balanceSlippage = +token1Balance.toString() * 0.01;
      shouldForceMax = Math.abs(amountDiff) < balanceSlippage;

      if (shouldForceMax) {
        this.logger.log(
          `[Add liquidity: ${addToLpIdForLogs}]: Forcing max amount in due to small difference (${amountDiff})`,
        );
        amount = +formatUnits(
          token1Balance - BigInt(Math.trunc(amountDiff)),
          tokenOutInfo.decimals || 18,
        );
        const amounts = await this.computeAmounts(
          chainId,
          tokenInInfo,
          tokenOutInfo,
          amount,
          slippage,
          tokenIn,
          pool,
        );
        amountADesiredBN = amounts.amountADesiredBN;
        amountBDesiredBN = token1Balance;
        amountAMinBN = amounts.amountAMinBN;
        amountBMinBN = amounts.amountBMinBN;
        amountAToApproveBN = amounts.amountAToApproveBN;
        amountBToApproveBN = amounts.amountBToApproveBN;
        amountIn = amounts.amountIn;
        amountOut = amounts.amountOut;
      }
    }
    if (token1Balance !== undefined && token1Balance < amountBDesiredBN) {
      const expectedAmount = formatUnits(
        amountBDesiredBN,
        tokenOutInfo.decimals || 18,
      );
      const actualAmount = formatUnits(
        token1Balance,
        tokenOutInfo.decimals || 18,
      );
      const diff = +expectedAmount - +actualAmount;
      return {
        success: false,
        message:
          `Balance of ${tokenOutInfo.symbol} not enough.` +
          ` Expected ${expectedAmount} but got ${actualAmount}.` +
          ` Swap from any token to ${diff} ${tokenOutInfo.symbol} is recommended.`,
      };
    }

    const { fee, feeBn } = this.aerodromeService.calculateFee(
      amountIn,
      Number(tokenInInfo.price),
      ethPrice,
      yamlConfig.FEE_DETAILS.FEE_PCT,
      viemClient.chain.nativeCurrency.decimals,
    );

    const ethBalance = await getBalance(viemClient, {
      address: fromAddress as Address,
    });
    if (isEthPool) {
      const ethAmount = isFromEth ? amountADesiredBN : amountBDesiredBN;
      if (ethBalance < ethAmount + feeBn) {
        return {
          success: false,
          message: `Balance of ETH not enough`,
        };
      }
    } else {
      if (ethBalance < feeBn) {
        return {
          success: false,
          message: `Balance of ETH not enough`,
        };
      }
    }

    const amountInUsd = formatUsd(amountIn, Number(tokenInInfo?.price) || 0);
    const amountOutUsd = formatUsd(amountOut, Number(tokenOutInfo?.price));

    const feeUsd = formatUsd(fee, ethPrice);

    this.logger.log(`[Add liquidity: ${addToLpIdForLogs}]: Fee: ${fee} ETH`);
    // endregion Calculations

    try {
      // AMM: type <= 0 | CL > 0
      if (pool.type <= 0) {
        if (isEthPool) {
          const token = isFromEth
            ? (tokenOutInfo.address as Address)
            : (tokenInInfo.address as Address);
          const amountTokenDesired = isFromEth
            ? amountBDesiredBN
            : amountADesiredBN;
          const amountTokenMin = isFromEth ? amountBMinBN : amountAMinBN;
          const amountETHMin = isFromEth ? amountAMinBN : amountBMinBN;
          const amountToApproveBN = isFromEth
            ? amountBToApproveBN
            : amountAToApproveBN;
          const value = isFromEth
            ? amountADesiredBN + feeBn
            : amountBDesiredBN + feeBn;

          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            await this.approveToken(
              chainId,
              fromAddress,
              token,
              amountToApproveBN,
            );

            txHash = (await this.privyService.sendTransaction({
              viemClient,
              address: yamlConfig.SWAPPER_CONTRACTS[chainId],
              abi: getSwapperAbiViaChain(chainId),
              functionName: 'addLiquidityETH',
              args: [
                token,
                stable,
                amountTokenDesired,
                amountTokenMin,
                amountETHMin,
                to,
                deadline,
                feeBn,
              ],
              chain: MAP_CHAIN_ID_CHAIN[chainId],
              value,
              account: fromAddress,
              gasLimit: 8000000,
            })) as Address;
          } else {
            try {
              await this.aerodromeService.estimateApprove(
                fromAddress,
                isFromEth ? token1Contract : token0Contract,
                isFromEth ? amountBDesiredBN : amountADesiredBN,
                router,
              );
            } catch (error) {
              this.logger.error(
                `[Add liquidity: ${addToLpIdForLogs}]: Transaction simulation fails ${error.message}`,
              );
              return {
                success: false,
                message: 'Transaction simulation fails',
              };
            }

            return {
              isSimulation,
              chainId,
              success: true,
              actionType: 'addLiquidityETH',
              token,
              stable,
              amountTokenDesired,
              amountTokenMin,
              amountETHMin,
              to,
              deadline,
              feeAmount: feeBn,
              value: Number(value),
              pool: pool.symbol,
              poolAddress: pool.lp,
              token0Symbol: tokenInInfo.symbol,
              token1Symbol: tokenOutInfo.symbol,
              fee,
              feeUsd,
              amountInUsd,
              amountOutUsd,
              amountIn,
              amountOut,
              amountToApproveBN,
            };
          }
        } else {
          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            await this.approveToken(
              chainId,
              fromAddress,
              tokenInInfo.address as Address,
              amountAToApproveBN,
            );
            await this.approveToken(
              chainId,
              fromAddress,
              tokenOutInfo.address as Address,
              amountBToApproveBN,
            );

            txHash = (await this.privyService.sendTransaction({
              viemClient,
              address: yamlConfig.SWAPPER_CONTRACTS[chainId],
              abi: getSwapperAbiViaChain(chainId),
              functionName: 'addLiquidity',
              args: [
                tokenInInfo.address as Address,
                tokenOutInfo.address as Address,
                stable,
                amountADesiredBN,
                amountBDesiredBN,
                amountAMinBN,
                amountBMinBN,
                fromAddress,
                deadline,
                feeBn,
              ],
              chain: MAP_CHAIN_ID_CHAIN[chainId],
              value: feeBn,
              account: fromAddress,
              gasLimit: 8000000,
            })) as Address;
          } else {
            try {
              await this.aerodromeService.estimateApprove(
                fromAddress,
                token0Contract,
                amountADesiredBN,
                router,
              );
              await this.aerodromeService.estimateApprove(
                fromAddress,
                token1Contract,
                amountBDesiredBN,
                router,
              );
            } catch (error) {
              this.logger.error(
                `[Add liquidity: ${addToLpIdForLogs}]: Transaction simulation fails ${error.message}`,
              );
              return {
                success: false,
                message: 'Transaction simulation fails',
              };
            }

            return {
              isSimulation,
              chainId,
              success: true,
              actionType: 'addLiquidity',
              tokenA: tokenInInfo.address,
              tokenB: tokenOutInfo.address,
              stable,
              amountADesired: amountADesiredBN,
              amountAToApproveBN,
              amountBToApproveBN,
              amountBDesired: amountBDesiredBN,
              amountAMin: amountAMinBN,
              amountBMin: amountBMinBN,
              to,
              deadline,
              feeAmount: feeBn,
              value: feeBn,
              pool: pool.symbol,
              poolAddress: pool.lp,
              token0Symbol: tokenInInfo.symbol,
              token1Symbol: tokenOutInfo.symbol,
              fee,
              feeUsd,
              amountInUsd,
              amountOutUsd,
              amountIn,
              amountOut,
            };
          }
        }
      } else {
        const { tickSpacing, tickLower, tickUpper } =
          this.calculatePoolTicks(pool);

        if (!tickSpacing || !tickLower || !tickUpper) {
          return {
            success: false,
            message: 'Ticks not found',
          };
        }

        if (isEthPool) {
          const value = isFromEth ? amountADesiredBN + feeBn : feeBn;
          const tokenToApprove = isFromEth
            ? tokenOutInfo.address
            : tokenInInfo.address;
          const valueToApprove = isFromEth
            ? amountBDesiredBN
            : amountADesiredBN;

          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            await this.approveToken(
              chainId,
              fromAddress,
              tokenToApprove as Address,
              valueToApprove,
            );

            txHash = (await this.privyService.sendTransaction({
              viemClient,
              address: yamlConfig.SWAPPER_CONTRACTS[chainId],
              abi: getSwapperAbiViaChain(chainId),
              functionName: 'mint',
              args: [
                {
                  token0: tokenInInfo.address as Address,
                  token1: tokenOutInfo.address as Address,
                  tickSpacing,
                  tickLower,
                  tickUpper,
                  amount0Desired: amountADesiredBN,
                  amount1Desired: amountBDesiredBN,
                  amount0Min: amountAMinBN,
                  amount1Min: amountBMinBN,
                  recipient: to,
                  deadline,
                  sqrtPriceX96: 0,
                },
                feeBn,
              ],
              chain: MAP_CHAIN_ID_CHAIN[chainId],
              value,
              account: fromAddress,
              gasLimit: 8000000,
            })) as Address;
          } else {
            try {
              await this.aerodromeService.estimateApprove(
                fromAddress,
                isFromEth ? token1Contract : token0Contract,
                isFromEth ? amountBDesiredBN : amountADesiredBN,
                router,
              );
            } catch (error) {
              this.logger.error(
                `[Add liquidity: ${addToLpIdForLogs}]: Transaction simulation fails ${error.message}`,
              );
              return {
                success: false,
                message: 'Transaction simulation fails',
              };
            }

            return {
              isSimulation,
              chainId,
              success: true,
              actionType: 'mint',
              token0: tokenInInfo.address,
              token1: tokenOutInfo.address,
              tickSpacing,
              tickLower,
              tickUpper,
              amount0Desired: amountADesiredBN,
              amountAToApproveBN,
              amountBToApproveBN,
              amount1Desired: amountBDesiredBN,
              amount0Min: amountAMinBN,
              amount1Min: amountBMinBN,
              recipient: to,
              deadline,
              sqrtPriceX96: 0,
              feeAmount: feeBn,
              value: Number(value),
              pool: pool.symbol,
              poolAddress: pool.lp,
              token0Symbol: tokenInInfo.symbol,
              token1Symbol: tokenOutInfo.symbol,
              fee,
              feeUsd,
              amountInUsd,
              amountOutUsd,
              amountIn,
              amountOut,
            };
          }
        } else {
          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            await this.approveToken(
              chainId,
              fromAddress,
              tokenInInfo.address as Address,
              amountADesiredBN,
            );
            await this.approveToken(
              chainId,
              fromAddress,
              tokenOutInfo.address as Address,
              amountBDesiredBN,
            );

            txHash = (await this.privyService.sendTransaction({
              viemClient,
              address: yamlConfig.SWAPPER_CONTRACTS[chainId],
              abi: getSwapperAbiViaChain(chainId),
              functionName: 'mint',
              args: [
                {
                  token0: tokenInInfo.address as Address,
                  token1: tokenOutInfo.address as Address,
                  tickSpacing,
                  tickLower,
                  tickUpper,
                  amount0Desired: amountADesiredBN,
                  amount1Desired: amountBDesiredBN,
                  amount0Min: amountAMinBN,
                  amount1Min: amountBMinBN,
                  recipient: to,
                  deadline,
                  sqrtPriceX96: 0,
                },
                feeBn,
              ],
              chain: MAP_CHAIN_ID_CHAIN[chainId],
              value: feeBn,
              account: fromAddress,
              gasLimit: 8000000,
            })) as Address;
          } else {
            try {
              await this.aerodromeService.estimateApprove(
                fromAddress,
                token0Contract,
                amountADesiredBN,
                router,
              );
              await this.aerodromeService.estimateApprove(
                fromAddress,
                token1Contract,
                amountBDesiredBN,
                router,
              );
            } catch (error) {
              this.logger.error(
                `[Add liquidity: ${addToLpIdForLogs}]: Transaction simulation fails ${error.message}`,
              );
              return {
                success: false,
                message: 'Transaction simulation fails',
              };
            }

            return {
              isSimulation,
              chainId,
              success: true,
              actionType: 'mint',
              token0: tokenInInfo.address,
              token1: tokenOutInfo.address,
              tickSpacing,
              tickLower,
              tickUpper,
              amount0Desired: amountADesiredBN,
              amountAToApproveBN,
              amountBToApproveBN,
              amount1Desired: amountBDesiredBN,
              amount0Min: amountAMinBN,
              amount1Min: amountBMinBN,
              recipient: to,
              deadline,
              sqrtPriceX96: 0,
              feeAmount: feeBn,
              value: Number(feeBn),
              pool: pool.symbol,
              poolAddress: pool.lp,
              token0Symbol: tokenInInfo.symbol,
              token1Symbol: tokenOutInfo.symbol,
              fee,
              feeUsd,
              amountInUsd,
              amountOutUsd,
              amountIn,
              amountOut,
            };
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `[Add liquidity: ${addToLpIdForLogs}]: Error occurred during add liquidity: ${error.message}.`,
      );

      return {
        success: false,
        message: error?.message || 'Something went wrong',
      };
    }

    this.logger.log('Transaction receipt:', txHash);

    if (!txHash) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: txHash,
    });

    this.logger.log('Receipt', receipt);

    return { ...receipt, success: true, isSimulation, chainId };
  }

  private async quoteAddLiquidity(
    chainId: number,
    tokenA: Address,
    tokenB: Address,
    amountADesired: bigint,
    amountBDesired: bigint,
    pool: PoolData,
  ) {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const { router } = chainsConfig[chainId];

      const contract = getContract({
        address: router,
        abi: routerAbi,
        client: viemClient,
      });

      return await contract.read.quoteAddLiquidity([
        tokenA,
        tokenB,
        pool.type === 0,
        pool.factory,
        amountADesired,
        amountBDesired,
      ]);
    } catch (error) {
      return null;
    }
  }

  private async computeAmounts(
    chainId: number,
    tokenInInfo: ITokenInfo,
    tokenOutInfo: ITokenInfo,
    amount: number,
    slippage: string,
    tokenIn: string,
    pool: PoolData,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);
    const { slipstreamSugar } = chainsConfig[chainId];

    let amountADesiredBN;
    let amountBDesiredBN;
    let amountAMinBN;
    let amountBMinBN;

    const tokenInUpper = tokenIn.toUpperCase();
    const poolToken0Upper = pool.token0Symbol?.toUpperCase();

    // check if pool is CL
    if (pool.type > 0) {
      const { tickLower, tickUpper } = this.calculatePoolTicks(pool);

      const contract = getContract({
        address: slipstreamSugar,
        abi: slipstreamSugarAbi,
        client: viemClient,
      });

      if (tokenInUpper === poolToken0Upper) {
        amountADesiredBN = parseUnits(
          amount.toFixed(tokenInInfo.decimals),
          tokenInInfo.decimals || 18,
        );
        amountBDesiredBN = await contract.read.estimateAmount1([
          amountADesiredBN,
          pool.lp,
          BigInt(0),
          tickLower,
          tickUpper,
        ]);
      } else {
        amountBDesiredBN = parseUnits(
          amount.toFixed(tokenOutInfo.decimals),
          tokenOutInfo.decimals || 18,
        );
        amountADesiredBN = await contract.read.estimateAmount0([
          amountBDesiredBN,
          pool.lp,
          BigInt(0),
          tickLower,
          tickUpper,
        ]);
      }

      amountAMinBN = this.calculateDepositMinimumAmount(
        amountADesiredBN,
        tokenInInfo.decimals || 18,
        slippage,
      );
      amountBMinBN = this.calculateDepositMinimumAmount(
        amountBDesiredBN,
        tokenOutInfo.decimals || 18,
        slippage,
      );
    } else {
      if (tokenInUpper === poolToken0Upper) {
        amountADesiredBN = parseUnits(
          amount.toFixed(tokenInInfo.decimals || 18),
          tokenInInfo.decimals || 18,
        );
        const amountOut =
          (amount * Number(tokenInInfo.price)) / Number(tokenOutInfo.price);
        amountBDesiredBN = parseUnits(
          amountOut.toFixed(tokenOutInfo.decimals || 18),
          tokenOutInfo.decimals || 18,
        );
      } else {
        const amountIn =
          (amount * Number(tokenOutInfo.price)) / Number(tokenInInfo.price);
        amountADesiredBN = parseUnits(
          amountIn.toFixed(tokenInInfo.decimals),
          tokenInInfo.decimals || 18,
        );
        amountBDesiredBN = parseUnits(
          amount.toFixed(tokenOutInfo.decimals),
          tokenOutInfo.decimals || 18,
        );
      }

      const optimalAmounts = await this.quoteAddLiquidity(
        chainId,
        tokenInInfo.address as Address,
        tokenOutInfo.address as Address,
        amountADesiredBN,
        amountBDesiredBN,
        pool,
      );
      amountAMinBN = this.calculateDepositMinimumAmount(
        optimalAmounts?.[0] || amountADesiredBN,
        tokenInInfo.decimals || 18,
        slippage,
      );
      amountBMinBN = this.calculateDepositMinimumAmount(
        optimalAmounts?.[1] || amountBDesiredBN,
        tokenOutInfo.decimals || 18,
        slippage,
      );
    }

    const amountAToApproveBN =
      amountADesiredBN +
      BigInt(Math.trunc(+amountADesiredBN.toString() * 0.05));
    const amountBToApproveBN =
      amountBDesiredBN +
      BigInt(Math.trunc(+amountBDesiredBN.toString() * 0.05));

    const amountIn = Number(
      formatUnits(amountADesiredBN, tokenInInfo.decimals || 18),
    );
    const amountOut = Number(
      formatUnits(amountBDesiredBN, tokenOutInfo.decimals || 18),
    );

    return {
      amountADesiredBN,
      amountBDesiredBN,
      amountAMinBN,
      amountBMinBN,
      amountAToApproveBN,
      amountBToApproveBN,
      amountIn,
      amountOut,
    };
  }

  private async assignTokensInfo(
    tokenIn: string,
    token0Info: ITokenInfo,
    token1Info: ITokenInfo,
    chainId: number,
  ) {
    const token0Price = await this.getTokenPrice(token0Info, chainId);
    const token1Price = await this.getTokenPrice(token1Info, chainId);

    const tokenInUpper = tokenIn.toUpperCase();
    const token0Symbol = token0Info.symbol.toUpperCase();
    const token1Symbol = token1Info.symbol.toUpperCase();

    token0Info.price = token0Price;
    token1Info.price = token1Price;

    if (tokenInUpper === token0Symbol) {
      return { tokenInInfo: token0Info, tokenOutInfo: token1Info };
    } else if (tokenInUpper === token1Symbol) {
      return { tokenInInfo: token0Info, tokenOutInfo: token1Info };
    }

    return null;
  }

  private async getTokenPrice(
    token: ITokenInfo,
    chainId: number,
  ): Promise<number> {
    let price = +(token?.price || 0);
    if (!price) {
      const tokenInfoDefi = await this.tokensService.getTokenInfo(
        token.address,
        chainId,
      );
      price = isNumber(tokenInfoDefi)
        ? tokenInfoDefi
        : tokenInfoDefi?.price || 0;
    }
    return price;
  }

  private async approveToken(
    chainId: number,
    fromAddress: Address,
    tokenAddress: Address,
    amountToApproveBN: bigint,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const allowance = await readContract(viemClient, {
      address: tokenAddress as Address,
      functionName: 'allowance',
      args: [fromAddress, yamlConfig.SWAPPER_CONTRACTS[chainId]],
      abi: erc20Abi,
    });

    this.logger.log('Approval', allowance, amountToApproveBN);

    if (allowance < amountToApproveBN) {
      await this.privyService.approve({
        viemClient,
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [yamlConfig.SWAPPER_CONTRACTS[chainId], amountToApproveBN],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        account: fromAddress,
      });
    }
  }

  private calculatePoolTicks(pool: PoolData) {
    const [lower, upper] = calculateTicks(
      pool.tick,
      pool.type,
      TICK_RANGES[0].ranges,
    );

    const tickSpacing = pool.type;
    const tickLower = lower;
    const tickUpper = upper;

    return { tickSpacing, tickLower, tickUpper };
  }

  private calculateDepositMinimumAmount(
    amount: bigint,
    decimals: number,
    slippage: number | string,
    percentage = '100',
  ): bigint {
    if (slippage === 0 && percentage === '100') {
      return amount;
    }

    const [integerPart, decimalPart = ''] = Number(percentage)
      .toLocaleString('en-US', { minimumFractionDigits: 16 })
      .split('.');

    const formattedDecimal = decimalPart
      .padEnd(decimals, '0')
      .slice(0, decimals);

    const multiplier = BigInt(integerPart + formattedDecimal);

    const divisor = BigInt(100) * BigInt(10 ** decimals);

    const adjustedAmount = (amount * multiplier) / divisor;

    if (slippage === 0 || Number(slippage) === 0) {
      return adjustedAmount;
    }
    const remainingAmount = this.aerodromeService.roundAmount(
      amount,
      BigInt(1),
      decimals,
      0,
      decimals,
    );
    const slippageBigInt = BigInt(Math.trunc(+slippage).toString());

    // Calculate the amount after applying slippage.
    const slippageAmount = (adjustedAmount * slippageBigInt) / BigInt(100);

    return remainingAmount - slippageAmount;
  }
}
