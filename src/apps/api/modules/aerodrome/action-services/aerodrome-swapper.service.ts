import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { isNumber } from 'class-validator';
import { ITokenInfo, TokenResponse } from '../../../../../common/types';
import { chainsConfig } from '../../../../../common/constants/chains';
import {
  Address,
  erc20Abi,
  formatEther,
  formatUnits,
  getContract,
  hexToBigInt,
  parseUnits,
  zeroAddress,
} from 'viem';
import {
  getDeFiBalancesKey,
  getTokenInfoKey,
} from '../../cache/constants/keys';
import { mixedQuoterAbi } from '../../../../../common/constants/chains/abis/mixed-quoter.abi';
import { base } from 'viem/chains';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import { MINUTE } from '../../../../../common/constants/time';
import { UniversalRouterBuilder } from '../../../../../common/utils/universal-route-builder';
import { universalRouterAbi } from '../../../../../common/constants/chains/abis/universal-router.abi';
import { formatNumber } from '../../../../../common/utils/round-number';
import { ViemService } from '../../viem/viem.service';
import { AerodromeRoutesService } from '../aerodrome-routes.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import { TokensService } from '../../tokens/tokens.service';
import { ISwap } from '../../../../../common/interfaces/actions/swap';
import { Hex } from '@privy-io/server-auth';
import { getTransactionReceipt, readContract } from 'viem/actions';
import { permit2Abi } from '../../../../../common/constants/chains/abis/permit2.abi';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';

@Injectable()
export class AerodromeSwapperService {
  private readonly logger = new Logger(AerodromeSwapperService.name);

  constructor(
    private readonly tokensService: TokensService,
    private readonly viemService: ViemService,
    private readonly routesService: AerodromeRoutesService,
    private readonly cacheService: CacheService,
    private readonly privyService: PrivyService,
  ) {}

  async swapArrayBySymbols(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    transactions: {
      tokenIn: string;
      tokenOut: string;
      amount: number;
      isAmountIn: boolean;
    }[],
    isSimulation = true,
  ) {
    this.logger.log(
      `${transactions.length} transactions to ${
        isSimulation ? 'simulate' : ''
      } swap`,
    );
    const results: Awaited<ReturnType<typeof this.swap>>[] = [];
    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      try {
        const result = await this.swapBySymbols(
          user,
          chainId,
          transaction.tokenIn,
          transaction.tokenOut,
          transaction.amount,
          transaction.isAmountIn,
          isSimulation,
          isExternalChat,
        );
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Error occurred during swapping ${transaction.tokenIn} to ${transaction.tokenOut} for user ${user.id}`,
          error,
        );
        results.push({
          success: false,
          message: 'Error occurred',
        });
      }
    }
    return results;
  }

  async swapBySymbols(
    user: UserEntity,
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    amount: number,
    isAmountIn = true,
    isSimulation = true,
    isExternalChat = false,
  ) {
    const isFromETH = tokenIn.toUpperCase() === 'ETH';
    const isToETH = tokenOut.toUpperCase() === 'ETH';

    const tokenInInfo = await this.tokensService.getTokenBySymbol(
      isFromETH ? 'WETH' : tokenIn,
      chainId,
      false,
      true,
      true,
      false,
    );

    const tokenOutInfo = await this.tokensService.getTokenBySymbol(
      isToETH ? 'WETH' : tokenOut,
      chainId,
      false,
      true,
      true,
      false,
    );

    if (!tokenInInfo || isNumber(tokenInInfo)) {
      this.logger.error(`Token ${tokenIn} not found`, tokenInInfo);
      return {
        success: false,
        message: `Token ${tokenIn} not found`,
      };
    }

    if (!tokenOutInfo || isNumber(tokenOutInfo)) {
      this.logger.error(`Token ${tokenOut} not found`, tokenOutInfo);
      return {
        success: false,
        message: `Token ${tokenOut} not found`,
      };
    }

    if (isNumber(tokenInInfo) || isNumber(tokenOutInfo)) {
      return {
        success: false,
        message: 'Token address not found',
      };
    }

    return await this.swap(
      user,
      chainId,
      tokenInInfo,
      tokenOutInfo,
      amount,
      isAmountIn,
      isFromETH,
      isToETH,
      isSimulation,
      isExternalChat,
    );
  }

  async swap(
    user: UserEntity,
    chainId: number,
    tokenIn: ITokenInfo,
    tokenOut: ITokenInfo,
    amount: number,
    isAmountIn: boolean,
    isFromETH = false,
    isToETH = false,
    isSimulation = true,
    isExternalChat = false,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { mixedQuoter, universalRouter, forceMaxRatio } =
      chainsConfig[chainId];

    // Set id for better logging
    const swapIdForLogs = crypto.randomUUID();
    this.logger.log(
      `[Swap: ${swapIdForLogs}]: Swapping ${tokenIn.symbol} (${tokenIn.address}) to ${tokenOut.symbol} (${tokenOut.address}). User: ${user.id}`,
    );

    const fromAddress = user.wallets.find((wallet) => wallet.isDefault)
      ?.address as Address | undefined;

    if (!fromAddress) {
      this.logger.error(`[Swap: ${swapIdForLogs}]: Wallet not found`);
      return {
        success: false,
        message: 'Wallet not found',
      };
    }

    this.logger.log(`[Swap: ${swapIdForLogs}]: Wallet address: ${fromAddress}`);

    // Get tokens from cache
    const tokensCacheKey = getTokenInfoKey(chainId);
    const tokens = await this.cacheService.get<TokenResponse[]>(tokensCacheKey);

    // Get ETH price in USD
    const ethToken = tokens?.find(
      (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
    );
    const ethPrice = +(ethToken?.price || 0);

    // Set slippage
    const slippage = 0.05;

    // Init router contract
    const mixedQuoterContract = getContract({
      address: mixedQuoter,
      abi: mixedQuoterAbi,
      client: viemClient,
    });

    // Get WETH address
    const WETH = await mixedQuoterContract.read.WETH9();

    const isWrapping =
      isFromETH && tokenOut.address.toLowerCase() === WETH.toLowerCase();
    const isUnwrapping =
      isToETH && tokenIn.address.toLowerCase() === WETH.toLowerCase();

    if (!ethToken || !ethPrice) {
      this.logger.error(`[Swap: ${swapIdForLogs}]: ETH price not found`);
      return {
        success: false,
        message: 'ETH price not found',
      };
    }

    // Token addresses should be different
    if (tokenIn.address === tokenOut.address && !isWrapping && !isUnwrapping) {
      this.logger.error(`[Swap: ${swapIdForLogs}]: Tokens are the same`);
      return {
        success: false,
        message: 'Tokens are the same',
      };
    }

    // ETH to ETH swap is not supported
    if (isFromETH && isToETH) {
      this.logger.error(
        `[Swap: ${swapIdForLogs}]: ETH to ETH swap is not supported`,
      );
      return {
        success: false,
        message: 'ETH to ETH swap is not supported',
      };
    }

    // Get input token contract
    const token0 = !isFromETH
      ? getContract({
          address: tokenIn.address as Address,
          abi: erc20Abi,
          client: viemClient,
        })
      : undefined;

    // Get token decimals
    const token0decimals = isFromETH
      ? viemClient.chain.nativeCurrency.decimals
      : tokenIn.decimals || 18;
    const token1decimals = isToETH
      ? viemClient.chain.nativeCurrency.decimals
      : tokenOut.decimals || 18;

    // Get token symbol
    const token0Symbol = isFromETH
      ? viemClient.chain.nativeCurrency.symbol
      : tokenIn.symbol || 'ETH';

    // Get token prices
    let token0Price = +(tokenIn.price || 0);
    let token1Price = +(tokenOut.price || 0) || 0;

    this.logger.log(
      `[Swap: ${swapIdForLogs}]: Token prices: $${token0Price} of ${tokenIn.symbol}, $${token1Price} of ${tokenOut.symbol}`,
    );

    // If input token price is not found, get it from DeFi service
    if (!token0Price) {
      const token0Info = await this.tokensService.getTokenInfo(
        tokenIn.address,
        chainId,
      );
      token0Price = isNumber(token0Info) ? token0Info : token0Info?.price || 0;
    }

    // If output token price is not found, get it from DeFi service
    if (!token1Price) {
      const token1Info = await this.tokensService.getTokenInfo(
        tokenOut.address,
        chainId,
      );
      token1Price = isNumber(token1Info) ? token1Info : token1Info?.price || 0;
    }

    // If token prices are not found, swap most likely will result in money loss
    if (!token0Price || +token0Price < 0 || !token1Price || +token1Price < 0) {
      const message = `Token price not found for (${tokenIn.symbol}: ${token0Price}, ${tokenOut.symbol}: ${token1Price})`;
      this.logger.error(`[Swap: ${swapIdForLogs}]: ${message}`);
      return {
        success: false,
        message,
      };
    }

    // Calculate amount in
    let amountIn = amount;

    // If amount out is given, calculate amount in
    if (!isAmountIn) {
      const amountOut = amount;
      amountIn = (amountOut * token1Price) / token0Price;
    }

    let amountInBn = parseUnits((amountIn || 0).toFixed(18), token0decimals);

    if (!amountInBn) {
      this.logger.error(`[Swap: ${swapIdForLogs}]: Amount is invalid`);
      return {
        success: false,
        message: 'Amount is invalid',
      };
    }

    // Calculate swap fee
    const token0PriceInEth = token0Price / ethPrice; // Price of token0 in ETH
    const feePercentage = yamlConfig.FEE_DETAILS.FEE_PCT / 100; // Fee percentage
    const fee = amountIn * feePercentage * token0PriceInEth; // Fee in ETH
    const feeBn = parseUnits(
      fee.toFixed(viemClient.chain.nativeCurrency.decimals),
      ethToken.decimals,
    );

    const gasPrice = await viemClient.getGasPrice();
    const AVERAGE_GAS_PER_TX = BigInt(350000);

    this.logger.log(`[Swap: ${swapIdForLogs}]: Fee: ${fee} ETH`);

    let shouldForceMax = false;

    // Check balance
    if (isFromETH) {
      // Get balance of native currency
      const balance = await viemClient.getBalance({
        address: fromAddress,
      });
      this.logger.log(
        `[Swap: ${swapIdForLogs}]: Balance of ${fromAddress} is ${balance} ${token0Symbol}. Required amount is ${amountInBn} ${token0Symbol}`,
      );

      const amountDiff = +balance.toString() - +amountInBn.toString();
      shouldForceMax = Math.abs(amountDiff) < +balance.toString() * 0.01;

      if (shouldForceMax) {
        this.logger.log(
          `[Swap: ${swapIdForLogs}]: Forcing max amount in due to small difference (${amountDiff})`,
        );
        amountInBn =
          balance - feeBn - gasPrice * AVERAGE_GAS_PER_TX * forceMaxRatio;
        amountIn = +formatUnits(balance, token0decimals);
      }

      if (balance < amountInBn) {
        // Check if balance is enough
        const message =
          `Not enough ${token0Symbol} to pay for the transaction, need amountInBn: ${amountInBn}, have: ${balance}.\n` +
          `Please, top up your wallet to proceed transaction. ` +
          `Note: spending all ETH may result in future transaction failures due to insufficient gas fees.`;
        this.logger.error(`[Swap: ${swapIdForLogs}]: ${message}`);
        return {
          success: false,
          message,
        };
      }
    } else {
      // Get balance of input token
      const token0Balance =
        (await token0?.read.balanceOf([fromAddress])) || BigInt(0);
      this.logger.log(
        `[Swap: ${swapIdForLogs}]: Balance of ${fromAddress} is ${token0Balance}. Required amount is ${amountInBn} ${token0Symbol}`,
      );

      if (!token0Balance) {
        const message =
          `No balance ${token0Symbol} to pay for the transaction.\n` +
          `Please, top up your wallet to proceed transaction.`;
        this.logger.error(`[Swap: ${swapIdForLogs}]: ${message}`);
        return {
          success: false,
          message,
        };
      }

      const amountDiff = +token0Balance.toString() - +amountInBn.toString();
      shouldForceMax = Math.abs(amountDiff) < +token0Balance.toString() * 0.01;

      if (shouldForceMax) {
        this.logger.log(
          `[Swap: ${swapIdForLogs}]: Forcing max amount in due to small difference (${amountDiff})`,
        );
        amountInBn = token0Balance;
        amountIn = +formatUnits(token0Balance, token0decimals);
      }

      // Check if balance is enough
      if ((token0Balance && token0Balance < amountInBn) || !token0Balance) {
        const message =
          `Not enough ${token0Symbol} to pay for the transaction. Need: ${amountInBn}, have: ${token0Balance}. ` +
          `Please top up your wallet to proceed with the transaction.`;
        this.logger.error(`[Swap: ${swapIdForLogs}]: ${message}`);
        return {
          success: false,
          message,
        };
      }
    }

    // Get actual amount out from Aerodrome
    const amountInWithSlippageBn = parseUnits(
      (amountIn * (1 - slippage)).toFixed(18),
      token0decimals,
    );

    // Build the shortest swap route
    const { bestPath: routes, routesWithPools } =
      !isWrapping && !isUnwrapping
        ? await this.routesService.findShortestSwapRoute(
            chainId,
            isFromETH ? WETH : tokenIn.address,
            isToETH ? WETH : tokenOut.address,
            amountInWithSlippageBn,
          )
        : {
            bestPath: [],
            routesWithPools: [],
          };
    const routesEncoded =
      !isWrapping && !isUnwrapping
        ? this.routesService.encodePath(routes as (Address | number)[])
        : undefined;

    const path = routes?.map((r) => `${r}`).join(' -> ');
    this.logger.log(`[Swap: ${swapIdForLogs}]: Path: ${path}`);

    if (!isWrapping && !isUnwrapping && (!routes || routes.length <= 0)) {
      this.logger.error(
        `[Swap: ${swapIdForLogs}]: No route found for ${tokenIn.symbol} to ${tokenOut.symbol}`,
      );
      return {
        success: false,
        message: 'No route found',
      };
    }

    // Calculate expected amount out
    const amountOutExpected =
      ((amountIn * token0Price) / token1Price) * (1 - slippage);

    let amountOutBn: bigint;
    let amountOut: number;

    if (isAmountIn && !isWrapping && !isUnwrapping && routesEncoded) {
      const { result } = await mixedQuoterContract.simulate.quoteExactInput(
        [routesEncoded, amountInWithSlippageBn],
        {
          account: fromAddress,
          chain: base,
        },
      );

      this.logger.log(
        `[Swap: ${swapIdForLogs}]: quoteExactInput result: ${result[0]}`,
      );

      amountOutBn = BigInt(result[0]);
      amountOut = +formatUnits(amountOutBn, token1decimals);
    } else if (!isWrapping && !isUnwrapping) {
      // If amount out is given, use it
      amountOut = amount * (1 - slippage);
      amountOutBn = parseUnits((amountOut || 0).toFixed(18), token1decimals);
    } else {
      amountOutBn = amountInBn;
      amountOut = amountIn;
    }

    this.logger.log(
      `[Swap: ${swapIdForLogs}]: Amount out expected: ${amountOutExpected}_${token1decimals}, actual amount out: ${amountOut}_${token1decimals}`,
    );

    // If amount out is 30% less than expected, swap will result in money loss
    if (amountOut <= amountOutExpected * 0.7) {
      this.logger.error(
        `[Swap: ${swapIdForLogs}]: Amount out returned from Aerodrome is less than expected. Swap will result in money loss`,
      );
      return {
        success: false,
        message: `Aerodrome returned amount out much less than expected. Swap will result in money loss.`,
      };
    }

    // If amount out is less or equal to 0, swap is not possible
    if (amountOutBn <= 0) {
      this.logger.error(
        `[Swap: ${swapIdForLogs}]: Amount out is less or equal to 0. Swap is not possible`,
      );
      return {
        success: false,
        message: 'Insufficient liquidity',
      };
    }

    // Get exchange rate of the swap pair
    const rateBn =
      (amountOutBn * BigInt(10 ** token0decimals)) /
      (amountInBn * BigInt(10 ** token1decimals));
    const rate = +formatUnits(rateBn, token1decimals);

    // Calculate deadline for the transaction
    const deadline = BigInt(Date.now() + 10 * MINUTE);
    let action;
    const builder = new UniversalRouterBuilder();
    // Enum representing different types of swap and token-related commands.

    // Transfer fee
    builder.addCommand(UniversalRouterBuilder.SwapCommand.TRANSFER, [
      zeroAddress,
      yamlConfig.FEE_MASTER_WALLET_ADDRESS[chainId],
      feeBn,
    ]);

    // Wrap ETH if the source token is native and needs to be wrapped.
    let isEthWrapped = false;
    if (isFromETH && !isUnwrapping) {
      builder.addCommand(UniversalRouterBuilder.SwapCommand.WRAP_ETH, [
        isWrapping ? fromAddress : universalRouter,
        amountInBn,
      ]);
      isEthWrapped = true;
    }

    const executionConstant = hexToBigInt(
      '0x8000000000000000000000000000000000000000000000000000000000000000',
    );

    // Group the swap path by type (V2 vs V3).
    const groupedPath: {
      from: Address;
      to: Address;
      type: number;
      lp: Address;
    }[][] = [];
    if (!isWrapping && !isUnwrapping) {
      for (let i = 0; i < (routesWithPools?.length || 0); i++) {
        const currentNode = routesWithPools[i];
        const lastGroup = groupedPath.at(-1);

        if (lastGroup) {
          const currentType = Number(currentNode.type);
          const lastType = Number(lastGroup[0].type);

          // Group consecutive nodes of the same type together.
          if (
            (currentType < 1 && lastType < 1) ||
            (currentType >= 1 && lastType >= 1)
          ) {
            lastGroup.push(currentNode);
          } else {
            groupedPath.push([currentNode]);
          }
        } else {
          groupedPath.push([currentNode]);
        }
      }
    }

    // Handle single-path swap.
    if (groupedPath.length === 1 && !isWrapping && !isUnwrapping) {
      const singlePath = groupedPath[0];
      const isV2Swap = Number(singlePath[0].type) < 1;

      builder.addCommand(
        isV2Swap
          ? UniversalRouterBuilder.SwapCommand.V2_SWAP_EXACT_IN
          : UniversalRouterBuilder.SwapCommand.V3_SWAP_EXACT_IN,
        [
          isToETH ? universalRouter : fromAddress,
          amountInBn,
          amountOutBn,
          isV2Swap
            ? singlePath.map((node) => ({
                from: node.from,
                to: node.to,
                stable: Number(node.type) === 0,
              }))
            : this.routesService.buildV3SwapPath(singlePath),
          !isEthWrapped,
        ],
      );
    } else if (!isWrapping && !isUnwrapping) {
      // Handle multi-path swap.
      const [firstPath, ...remainingPaths] = groupedPath;
      const [lastPath, ...middlePaths] = remainingPaths.reverse();
      middlePaths.reverse();

      const isFirstV2Swap = Number(firstPath[0].type) < 1;
      const lastRelevantPath =
        middlePaths.length > 0 ? middlePaths[0] : lastPath;

      // First swap
      builder.addCommand(
        isFirstV2Swap
          ? UniversalRouterBuilder.SwapCommand.V2_SWAP_EXACT_IN
          : UniversalRouterBuilder.SwapCommand.V3_SWAP_EXACT_IN,
        [
          isFirstV2Swap ? universalRouter : lastRelevantPath[0].lp,
          amountInBn,
          BigInt(0),
          isFirstV2Swap
            ? firstPath.map((node) => ({
                from: node.from,
                to: node.to,
                stable: Number(node.type) === 0,
              }))
            : this.routesService.buildV3SwapPath(firstPath),
          !isEthWrapped,
        ],
      );

      // Middle swaps
      if (middlePaths.length > 0) {
        middlePaths.forEach((path, index) => {
          const isV2Swap = Number(path[0].type) < 1;
          const nextPath =
            index + 1 < middlePaths.length ? middlePaths[index + 1] : lastPath;

          builder.addCommand(
            isV2Swap
              ? UniversalRouterBuilder.SwapCommand.V2_SWAP_EXACT_IN
              : UniversalRouterBuilder.SwapCommand.V3_SWAP_EXACT_IN,
            [
              isV2Swap ? universalRouter : nextPath[0].lp,
              isV2Swap ? BigInt(0) : executionConstant,
              BigInt(0),
              isV2Swap
                ? path.map((node) => ({
                    from: node.from,
                    to: node.to,
                    stable: Number(node.type) === 0,
                  }))
                : this.routesService.buildV3SwapPath(path),
              false,
            ],
          );
        });
      }
      // Final swap
      const isFinalV2Swap = Number(lastPath[0].type) < 1;
      builder.addCommand(
        isFinalV2Swap
          ? UniversalRouterBuilder.SwapCommand.V2_SWAP_EXACT_IN
          : UniversalRouterBuilder.SwapCommand.V3_SWAP_EXACT_IN,
        [
          isToETH ? universalRouter : fromAddress,
          isFinalV2Swap ? BigInt(0) : executionConstant,
          amountOutBn,
          isFinalV2Swap
            ? lastPath.map((node) => ({
                from: node.from,
                to: node.to,
                stable: Number(node.type) === 0,
              }))
            : this.routesService.buildV3SwapPath(lastPath),
          false,
        ],
      );
    }

    // Unwrap ETH if the final token is native.
    if (isUnwrapping) {
      this.logger.log(
        `[Swap: ${swapIdForLogs}]: Unwrapping ${WETH} ${universalRouter} ${amountInBn}`,
      );
      builder.addCommand(
        UniversalRouterBuilder.SwapCommand.PERMIT2_TRANSFER_FROM,
        [WETH, universalRouter, amountInBn],
      );
    }

    if (isToETH && !isWrapping) {
      builder.addCommand(UniversalRouterBuilder.SwapCommand.UNWRAP_WETH, [
        fromAddress,
        amountOutBn,
      ]);
    }

    const universalRouterContract = getContract({
      address: universalRouter,
      abi: universalRouterAbi,
      client: viemClient,
    });

    let gasBn = BigInt(0);

    if (isFromETH) {
      // Swap exact ETH for tokens
      action = 'swapExactETHForTokens';
      try {
        // Estimate gas for the transaction
        gasBn = await universalRouterContract.estimateGas.execute(
          [builder.commands, builder.inputs, deadline],
          {
            account: fromAddress,
            value: amountInBn + feeBn,
          },
        );

        if (shouldForceMax) {
          amountInBn = amountInBn - gasBn * forceMaxRatio;
          amountIn = +formatUnits(amountInBn, token0decimals);
        }
      } catch (error) {
        this.logger.error(
          `[Swap: ${swapIdForLogs}]: Transaction simulation fails ${error.message}`,
        );
        return {
          success: false,
          message: 'Transaction simulation fails',
        };
      }
    } else if (isToETH) {
      // Swap exact tokens for ETH
      action = 'swapExactTokensForETH';
      try {
        // Estimate gas for the transaction
        const allowance = await token0?.read.allowance([
          fromAddress,
          universalRouter,
        ]);

        if (allowance && allowance < amountInBn) {
          const approvalGas = await token0?.estimateGas.approve(
            [universalRouter, amountInBn],
            {
              account: fromAddress,
            },
          );
          if (approvalGas) {
            gasBn += approvalGas;
          }
        }

        gasBn += AVERAGE_GAS_PER_TX * gasPrice;
      } catch (error) {
        this.logger.error(
          `[Swap: ${swapIdForLogs}]: Transaction simulation fails ${error.message}`,
        );
        return {
          success: false,
          message: 'Transaction simulation fails',
        };
      }
    } else if (!isFromETH && !isToETH) {
      // Swap exact tokens for tokens
      action = 'swapExactTokensForTokens';
      try {
        // Estimate gas for the transaction
        const allowance = await token0?.read.allowance([
          fromAddress,
          universalRouter,
        ]);

        if (allowance && allowance < amountInBn) {
          const approvalGas = await token0?.estimateGas.approve(
            [universalRouter, amountInBn],
            {
              account: fromAddress,
            },
          );
          if (approvalGas) {
            gasBn += approvalGas;
          }
        }

        gasBn += AVERAGE_GAS_PER_TX * gasPrice;
      } catch (error) {
        this.logger.error(
          `[Swap: ${swapIdForLogs}]: Transaction simulation fails ${error.message}`,
        );
        return {
          success: false,
          message: 'Transaction simulation fails',
        };
      }
    }

    const token0Formatted = `${tokenIn.address.slice(
      0,
      4,
    )}...${tokenIn.address.slice(-4)}`;
    const token1Formatted = `${tokenOut.address.slice(
      0,
      4,
    )}...${tokenOut.address.slice(-4)}`;

    const shouldExecuteWithoutConfirmation =
      user.should_execute_actions_without_confirmation;

    if (
      (isExternalChat && !isSimulation) ||
      (isExternalChat && shouldExecuteWithoutConfirmation)
    ) {
      try {
        const response = await this.privySwap(
          chainId,
          {
            success: true,
            fromAddress: fromAddress as Address,
            action,
            token0: tokenIn.address as Address,
            token1: tokenOut.address as Address,
            amountIn: amountInBn.toString(),
            amountInFormatted: formatNumber(
              formatUnits(amountInBn, token0decimals),
              {
                minimumFractionDigits: 1,
                maximumFractionDigits: 6,
              },
            ),
            amountOut: amountOutBn.toString(),
            amountOutFormatted: formatNumber(
              formatUnits(amountOutBn, token1decimals),
              {
                minimumFractionDigits: 1,
                maximumFractionDigits: 6,
              },
            ),
            routes: routes as (Address | number)[],
            rate,
            slippage: slippage * 100,
            gas: (gasBn * BigInt(2)).toString(),
            gasFormatted: formatNumber(formatEther(gasBn * BigInt(2)), {
              maximumFractionDigits: 18,
            }),
            feeETH: feeBn.toString(),
            feeAddress: yamlConfig.FEE_MASTER_WALLET_ADDRESS[
              chainId
            ] as Address,
            isWrapping,
            isUnwrapping,
          },
          builder.commands,
          builder.inputs,
        );

        return { ...response, token0Formatted, token1Formatted, chainId };
      } catch (error) {
        return {
          success: false,
          message: JSON.stringify(error.message),
        };
      }
    }

    let message;

    if (shouldForceMax) {
      message = `Amount of ${token0Symbol} is rounded to the maximum possible value due to small difference in balance. Please, check the transaction details before proceeding.`;
    }

    const amountInUSD = formatNumber(amountIn * token0Price, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

    const amountOutUSD = formatNumber(amountOut * token1Price, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

    const gasUsdWithoutFormatting =
      ethPrice * Number(formatEther(gasBn * BigInt(2)));
    const gasUSD = formatNumber(gasUsdWithoutFormatting, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });

    if (!isSimulation) {
      const balanceKey = getDeFiBalancesKey(fromAddress, chainId);
      this.cacheService.del(balanceKey);
    }

    return {
      success: true,
      chainId,
      message,
      isSimulation,
      fromAddress,
      action,
      token0: isFromETH ? zeroAddress : tokenIn.address,
      tokenInSymbol: isFromETH ? 'ETH' : tokenIn.symbol,
      token1: isToETH ? zeroAddress : tokenOut.address,
      tokenOutSymbol: isToETH ? 'ETH' : tokenOut.symbol,
      amountIn: amountInBn.toString(),
      amountInFormatted: formatUnits(amountInBn, token0decimals),
      amountInUSD,
      amountOut: amountOutBn.toString(),
      amountOutFormatted: formatUnits(
        BigInt(Math.floor(Number(amountOutBn) * 1.05)),
        token1decimals,
      ),
      amountOutUSD,
      routes,
      rate,
      slippage: slippage * 100,
      gas: (BigInt(1) * BigInt(2)).toString(),
      gasFormatted: formatNumber(formatEther(gasBn * BigInt(2)), {
        maximumFractionDigits: 18,
      }),
      gasUSD,
      feeETH: +feeBn.toString(),
      feeAddress: yamlConfig.FEE_MASTER_WALLET_ADDRESS[chainId],
      token0Formatted,
      token1Formatted,
      commands: builder.commands,
      inputs: builder.inputs,
      isWrapping,
      isUnwrapping,
    };
  }

  private async privySwap(
    chainId: number,
    data: ISwap,
    commands: Hex,
    inputs: Hex[],
  ) {
    if (!data) {
      throw new Error('Invalid swap data');
    }

    const viemClient = this.viemService.getViemClient(chainId);

    const { universalRouter } = chainsConfig[chainId];

    const deadline = BigInt(Date.now() + 10 * MINUTE);
    const address = data.fromAddress;

    if (!address) {
      throw new Error('Invalid account');
    }

    const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

    const isUnwrapping = data.isUnwrapping;

    const feeBn = BigInt(data.feeETH);
    const amountInBn = BigInt(data.amountIn);

    const amountToApproveBn =
      amountInBn + BigInt(Math.trunc(+amountInBn.toString() * 0.001));

    let tx: Address | undefined;
    if (data.action === 'swapExactETHForTokens') {
      tx = (await this.privyService.sendTransaction({
        viemClient,
        address: universalRouter,
        abi: universalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: amountInBn + feeBn,
        account: address,
      })) as Address;
    } else if (data.action === 'swapExactTokensForETH') {
      if (isUnwrapping) {
        const [allowance, expiration] = await readContract(viemClient, {
          address: PERMIT2,
          functionName: 'allowance',
          args: [address, data.token0, universalRouter],
          abi: permit2Abi,
        });
        const currentTime = Date.now();
        this.logger.log(
          `PERMIT2 Approval ${allowance} ${amountToApproveBn} ${expiration} ${currentTime}`,
        );

        if (
          allowance < amountToApproveBn ||
          Number(expiration) <= Number(currentTime)
        ) {
          await this.privyService.approve({
            viemClient,
            address: PERMIT2,
            abi: permit2Abi,
            functionName: 'approve',
            args: [
              data.token0,
              universalRouter,
              amountToApproveBn,
              +deadline.toString(),
            ],
            chain: MAP_CHAIN_ID_CHAIN[chainId],
            account: address,
          });
        }
      }
      const allowanceTo = isUnwrapping ? PERMIT2 : universalRouter;
      const allowance = await readContract(viemClient, {
        address: data.token0,
        functionName: 'allowance',
        args: [address, allowanceTo],
        abi: erc20Abi,
      });
      this.logger.log(`ERC20 Approval ${allowance} ${amountToApproveBn}`);

      if (allowance < amountToApproveBn) {
        await this.privyService.approve({
          viemClient,
          address: data.token0,
          abi: erc20Abi,
          functionName: 'approve',
          args: [allowanceTo, amountToApproveBn],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          account: address,
        });
      }

      tx = (await this.privyService.sendTransaction({
        viemClient,
        address: universalRouter,
        abi: universalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: feeBn,
        account: address,
      })) as Address;
    } else if (data.action === 'swapExactTokensForTokens') {
      const allowance = await readContract(viemClient, {
        address: data.token0,
        functionName: 'allowance',
        args: [address, universalRouter],
        abi: erc20Abi,
      });

      this.logger.log(`ERC20 Approval ${allowance} ${amountToApproveBn}`);

      if (allowance < amountToApproveBn) {
        await this.privyService.approve({
          viemClient,
          address: data.token0,
          abi: erc20Abi,
          functionName: 'approve',
          args: [universalRouter, amountToApproveBn],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          account: address,
        });
      }

      tx = (await this.privyService.sendTransaction({
        viemClient,
        address: universalRouter,
        abi: universalRouterAbi,
        functionName: 'execute',
        args: [commands, inputs],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: feeBn,
        account: address,
      })) as Address;
    }

    this.logger.log(`Transaction receipt: ${tx}`);

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    this.logger.log(`Transaction receipt: ${JSON.stringify(receipt)}`);

    return { ...receipt, success: true, isSimulation: false, chainId };
  }
}
