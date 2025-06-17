import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { isBoolean, isNumber, isString } from 'class-validator';
import { PoolData, TokenResponse } from '../../../../../common/types';
import { getPoolsDataKey, getTokenInfoKey } from '../../cache/constants/keys';
import {
  Address,
  erc20Abi,
  erc721Abi,
  formatEther,
  formatUnits,
  getContract,
  maxUint128,
  parseUnits,
} from 'viem';
import { MINUTE } from '../../../../../common/constants/time';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import { IWithdraw } from '../../../../../common/interfaces/actions/withdraw';
import { ViemService } from '../../viem/viem.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import {
  getTransactionReceipt,
  readContract,
  waitForTransactionReceipt,
} from 'viem/actions';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { VelodromeService } from '../velodrome.service';
import { WithdrawAmountTypeEnum } from '../../../../../common/enums/withdraw-amount-type.enum';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';

@Injectable()
export class VelodromeWithdrawService {
  private readonly logger = new Logger(VelodromeWithdrawService.name);

  private readonly AVERAGE_GAS_REMOVE_LIQUIDITY = BigInt(261000);
  private readonly AVERAGE_GAS_DECREASE_LIQUIDITY = BigInt(278000);
  private readonly AVERAGE_GAS_COLLECT_LIQUIDITY = BigInt(241000);

  constructor(
    private readonly cacheService: CacheService,
    private readonly velodromeService: VelodromeService,
    private readonly viemService: ViemService,
    private readonly privyService: PrivyService,
  ) {}

  async withdrawAMMPoolLiquidity(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    amount: number,
    amountType: WithdrawAmountTypeEnum,
    isSimulation = true,
  ) {
    const withdrawIdForLogs = crypto.randomUUID();
    //validate arguments
    if (
      !isBoolean(isExternalChat) ||
      !isBoolean(isSimulation) ||
      !isString(poolSymbol) ||
      !isNumber(amount) ||
      !Object.values(WithdrawAmountTypeEnum).includes(amountType)
    ) {
      return {
        success: false,
        message: 'Invalid operation. Please try again',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      this.logger.log(
        `[Withdraw: ${withdrawIdForLogs}]: Withdrawing from pool ${poolSymbol}. User: ${user.id}`,
      );

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Tokens not found`);
        throw new Error('Can`t get tokens info');
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Wallet not found`);
        throw new Error('Wallet not found');
      }

      const positions = await this.velodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
        true,
      );

      if (!positions || !Array.isArray(positions)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Positions not found`,
        );
        throw new Error('Cant get positions');
      }

      const position = positions.find((pos) =>
        pos.symbol?.toLowerCase().includes(poolSymbol.toLowerCase()),
      );

      if (!position) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Position not found`,
        );
        throw new Error(`Cant get position with symbol ${poolSymbol}`);
      }

      const pools = await this.cacheService.get<PoolData[]>(
        getPoolsDataKey(chainId),
      );

      const targetPool = pools?.find(
        (pool) =>
          pool.symbol.toLowerCase().includes(poolSymbol.toLowerCase()) &&
          pool.lp === position.lp,
      );

      if (!targetPool) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Pool not found`);
        throw new Error(
          `Oops! Sorry, pool with symbol ${poolSymbol} not found`,
        );
      }

      const deadline = BigInt(Date.now() + 10 * MINUTE);

      if (!position.liquidity || position.liquidity <= BigInt(0)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: No liquidity found in position`,
          position,
        );
        throw new Error('No liquidity found in this position');
      }

      const token0Info = tokens.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token0.toLowerCase(),
      );

      const token1Info = tokens.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token1.toLowerCase(),
      );

      if (!token0Info || !token1Info) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Tokens not found . ${targetPool.token0} ${targetPool.token1}`,
        );
        throw new Error('Can`t get tokens info');
      }

      const { lpAmount, amountToken0, amountToken1 } =
        this.calculateWithdrawAmounts(
          position.liquidity,
          position.amount0,
          position.amount1,
          amount,
          amountType,
          token0Info,
          token1Info,
        );

      const slippage = 0.005; //TODO: magic number
      const minAmountToken0 = BigInt(
        Math.floor(Number(amountToken0) * (1 - slippage)),
      );
      const minAmountToken1 = BigInt(
        Math.floor(Number(amountToken1) * (1 - slippage)),
      );

      if (isSimulation) {
        return await this.simulateWithdraw(
          chainId,
          targetPool,
          amountToken0,
          amountToken1,
          poolSymbol,
          false,
        );
      }

      const ethToken = tokens?.find(
        (t) => t.symbol.toUpperCase() === 'WETH'.toUpperCase(),
      );

      let feeBn: bigint;
      const feePercentage = yamlConfig.FEE_DETAILS.FEE_PCT / 100;
      const fee = feePercentage * Number(formatEther(amountToken0)) * 2; // 2 times cause we have to tokens in pool
      feeBn = parseUnits(
        fee.toFixed(viemClient.chain.nativeCurrency.decimals),
        ethToken?.decimals || 18,
      );
      if (!feeBn) {
        const fee = feePercentage * Number(formatEther(amountToken1)) * 2; // 2 times cause we have to tokens in pool
        feeBn = parseUnits(
          fee.toFixed(viemClient.chain.nativeCurrency.decimals),
          ethToken?.decimals || 18,
        );

        if (!feeBn) {
          throw new Error('Unable to get fee from this amount.');
        }
      }

      this.logger.log(
        `[Withdraw: ${withdrawIdForLogs}]: Fee: ${feeBn.toString()}`,
      );

      if (feeBn <= BigInt(0)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Fee is less than 0`,
        );
        throw new Error('Fee is less or equal than 0. Increase amount');
      }

      const amountToApproveBn =
        lpAmount + BigInt(Math.trunc(+lpAmount.toString() * 0.001));

      const withdrawData: IWithdraw = {
        toAddress: walletAddress,
        poolAddress: targetPool.lp,
        tokenId: `${position.id}`,
        liquidity: lpAmount,
        amount0Min: minAmountToken0,
        amount1Min: minAmountToken1,
        token0: targetPool.token0,
        token1: targetPool.token1,
        stable: Number(targetPool.type) === 0,
        deadline,
        feeETH: feeBn.toString(),
        action: 'withdrawAMM',
        amountLiquidityToApproveBn: amountToApproveBn,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        try {
          return await this.privyWithdraw(chainId, withdrawData);
        } catch (error) {
          this.logger.error(
            `[Withdraw: ${withdrawIdForLogs}]: ${error.message}`,
          );
          throw new HttpException(
            error.message || 'Withdrawal failed',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      try {
        const lpTokenContract = getContract({
          abi: erc20Abi,
          address: targetPool.lp,
          client: viemClient,
        });

        await this.velodromeService.estimateApprove(
          walletAddress,
          lpTokenContract,
          amountToApproveBn,
          yamlConfig.SWAPPER_CONTRACTS[chainId] as Address,
        );
      } catch (error) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Transaction simulation fails ${error.message}`,
        );
        throw new Error('Fails to estimate approve');
      }

      return {
        success: true,
        isSimulation,
        ...withdrawData,
        chainId,
      };
    } catch (error) {
      this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async withdrawCLPoolLiquidity(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    amountType: WithdrawAmountTypeEnum,
    isSimulation = true,
  ) {
    const withdrawIdForLogs = crypto.randomUUID();

    //validate arguments
    if (
      !isBoolean(isExternalChat) ||
      !isBoolean(isSimulation) ||
      !isString(poolSymbol) ||
      !isString(positionId) ||
      !isNumber(amount) ||
      !Object.values(WithdrawAmountTypeEnum).includes(amountType)
    ) {
      this.logger.error(
        `[Withdraw: ${withdrawIdForLogs}]: Not valid arguments`,
      );

      return {
        success: false,
        message: 'Invalid operation. Please try again',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      this.logger.log(
        `[Withdraw: ${withdrawIdForLogs}]: Withdrawing from pool ${poolSymbol}. User: ${user.id}`,
      );

      if (!positionId) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Amount ${positionId}`,
        );
        throw new Error(`Cant get position ID ${positionId}`);
      }

      const tokensCacheKey = getTokenInfoKey(chainId);
      const tokens = await this.cacheService.get<TokenResponse[]>(
        tokensCacheKey,
      );

      if (!tokens) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Tokens not found`);
        throw new Error('Can`t get tokens info');
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Wallet not found`);
        throw new Error('Wallet not found');
      }

      const positions = await this.velodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
        true,
      );

      if (!positions || !Array.isArray(positions)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Positions not found`,
        );
        return {
          success: false,
          message: 'Positions not found',
        };
      }

      const position = positions.find(
        (pos) => pos.id.toString() === positionId,
      );

      if (!position) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Position not found`,
        );
        return {
          success: false,
          message: 'Position not found',
        };
      }

      if (!position) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Position not found`,
        );
        return {
          success: false,
          message: 'Position not found',
        };
      }

      const pools = await this.cacheService.get<PoolData[]>(
        getPoolsDataKey(chainId),
      );

      const targetPool = pools?.find(
        (pool) =>
          pool.symbol.toLowerCase().includes(poolSymbol.toLowerCase()) &&
          pool.lp === position.lp,
      );

      if (!targetPool) {
        this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: Pool not found`);
        throw new Error('Pool not found');
      }

      const deadline = BigInt(Date.now() + 10 * MINUTE);

      if (!position.liquidity || position.liquidity <= BigInt(0)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: No liquidity found in position`,
          position,
        );
        throw new Error('No liquidity found in this position');
      }

      const token0Info = tokens.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token0.toLowerCase(),
      );

      const token1Info = tokens.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token1.toLowerCase(),
      );

      if (!token0Info || !token1Info) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Tokens not found. ${targetPool.token0} ${targetPool.token1}`,
        );
        throw new Error('Can`t get tokens info');
      }

      const { lpAmount, amountToken0, amountToken1 } =
        this.calculateWithdrawAmounts(
          position.liquidity,
          position.amount0,
          position.amount1,
          amount,
          amountType,
          token0Info,
          token1Info,
        );

      // Apply slippage
      const slippage = 5;
      const minAmountToken0 = this.calculateMinimumAmount(
        amountToken0,
        position.token0Decimals || 18,
        slippage,
      );
      const minAmountToken1 = this.calculateMinimumAmount(
        amountToken1,
        position.token1Decimals || 18,
        slippage,
      );

      if (isSimulation) {
        return await this.simulateWithdraw(
          chainId,
          targetPool,
          amountToken0,
          amountToken1,
          poolSymbol,
          true,
        );
      }

      const ethToken = tokens?.find(
        (t) => t.symbol.toUpperCase() === 'WETH'.toUpperCase(),
      );

      let feeBn: bigint;
      const feePercentage = yamlConfig.FEE_DETAILS.FEE_PCT / 100;
      const fee = feePercentage * Number(formatEther(amountToken0)) * 2; // 2 times cause we have to tokens in pool
      feeBn = parseUnits(
        fee.toFixed(viemClient.chain.nativeCurrency.decimals),
        ethToken?.decimals || 18,
      );
      if (!feeBn) {
        const fee = feePercentage * Number(formatEther(amountToken1)) * 2; // 2 times cause we have to tokens in pool
        feeBn = parseUnits(
          fee.toFixed(viemClient.chain.nativeCurrency.decimals),
          ethToken?.decimals || 18,
        );

        if (!feeBn) {
          throw new Error('Unable to get fee from this amount.');
        }
      }

      this.logger.log(
        `[Withdraw: ${withdrawIdForLogs}]: Fee: ${feeBn.toString()}`,
      );

      if (feeBn <= BigInt(0)) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Fee is less than 0`,
        );
        throw new Error('Fee is less or equal than 0. Increase amount');
      }

      const withdrawData: IWithdraw = {
        toAddress: walletAddress,
        poolAddress: targetPool.lp,
        tokenId: `${position.id}`,
        liquidity: lpAmount,
        amount0Min: minAmountToken0,
        amount1Min: minAmountToken1,
        token0: targetPool.token0,
        token1: targetPool.token1,
        stable: Number(targetPool.type) === 0,
        deadline,
        feeETH: feeBn.toString(),
        action: 'withdrawCL',
        nfpm: targetPool.nfpm as Address,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        try {
          return await this.privyWithdraw(chainId, withdrawData);
        } catch (error) {
          this.logger.error(
            `[Withdraw: ${withdrawIdForLogs}]: ${error.message}`,
          );
          throw new HttpException(
            error.message || 'Withdrawal failed',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      try {
        await this.estimateApproveNft(
          chainId,
          walletAddress,
          targetPool.nfpm as Address,
          `${position.id}`,
        );
      } catch (error) {
        this.logger.error(
          `[Withdraw: ${withdrawIdForLogs}]: Transaction simulation fails ${error.message}`,
        );
        throw new Error('Fails to estimate approve');
      }

      return {
        success: true,
        isSimulation,
        ...withdrawData,
        chainId,
      };
    } catch (error) {
      this.logger.error(`[Withdraw: ${withdrawIdForLogs}]: ${error.message}`);

      return {
        success: false,
        message: error.message,
      };
    }
  }

  calculateMinimumAmount(
    amount: bigint,
    decimals: number,
    slippage: number,
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
    const remainingAmount = this.velodromeService.roundAmount(
      amount,
      BigInt(1),
      decimals,
      0,
      decimals,
    );
    const slippageBigInt = BigInt(slippage.toString());

    // Calculate the amount after applying slippage.
    const slippageAmount = (adjustedAmount * slippageBigInt) / BigInt(100);

    return remainingAmount - slippageAmount;
  }

  private calculateWithdrawAmounts(
    liquidity: bigint,
    amount0: bigint,
    amount1: bigint,
    withdrawalAmount: number,
    amountType: WithdrawAmountTypeEnum,
    token0Info: TokenResponse,
    token1Info: TokenResponse,
  ) {
    const totalLiquidity = BigInt(liquidity);
    let lpAmount: bigint;
    let lpAmountUSD = 0;

    // Get token prices and decimals
    const { price: token0Price, decimals: token0Decimals } = token0Info;
    const { price: token1Price, decimals: token1Decimals } = token1Info;

    if (!token0Price || !token1Price) {
      throw new Error('Token prices are required for USD-based withdrawal');
    }

    // Calculate total position value in USD
    const total0USD =
      Number(formatUnits(amount0, token0Decimals)) * Number(token0Price);
    const total1USD =
      Number(formatUnits(amount1, token1Decimals)) * Number(token1Price);
    const totalUSD = total0USD + total1USD;

    switch (amountType) {
      case WithdrawAmountTypeEnum.Percent:
        if (withdrawalAmount > 1) {
          throw new Error('Withdrawal amount is greater than total value');
        }

        if (withdrawalAmount < 0) {
          throw new Error('Withdrawal amount is less than 0');
        }

        lpAmount = BigInt(
          Math.floor(Number(totalLiquidity) * withdrawalAmount),
        );
        lpAmountUSD = totalUSD * withdrawalAmount;
        break;
      case WithdrawAmountTypeEnum.USD:
        // Calculate what percentage of total value the requested USD amount represents
        const percentageOfTotal = withdrawalAmount / totalUSD;

        // Ensure we don't exceed 100%
        if (percentageOfTotal > 1) {
          throw new Error('Withdrawal amount is greater than total value');
        }

        lpAmount = BigInt(
          Math.floor(Number(totalLiquidity) * percentageOfTotal),
        );
        lpAmountUSD = withdrawalAmount;
        break;
      default:
        throw new Error('Invalid amount type');
    }

    // Calculate token amounts based on the determined lpAmount
    const amountToken0 = (BigInt(amount0) * lpAmount) / totalLiquidity;
    const amountToken1 = (BigInt(amount1) * lpAmount) / totalLiquidity;

    return {
      lpAmount,
      amountToken0,
      amountToken1,
      lpAmountUSD,
    };
  }

  private async simulateWithdraw(
    chainId: number,
    targetPool: PoolData,
    amountToken0: bigint,
    amountToken1: bigint,
    poolSymbol: string,
    isCLPool: boolean,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const tokens = await this.cacheService.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    const token0 = tokens?.find(
      (t) => t.token_address.toLowerCase() === targetPool.token0.toLowerCase(),
    );
    const token1 = tokens?.find(
      (t) => t.token_address.toLowerCase() === targetPool.token1.toLowerCase(),
    );

    const token0USD = (
      Number(formatUnits(amountToken0, token0?.decimals || 18)) *
      Number(token0?.price || 0)
    ).toFixed(2);

    const token1USD = (
      Number(formatUnits(amountToken1, token1?.decimals || 18)) *
      Number(token1?.price || 0)
    ).toFixed(2);

    const gasPrice = await viemClient.getGasPrice();

    const estimatedGas = isCLPool
      ? this.AVERAGE_GAS_COLLECT_LIQUIDITY + this.AVERAGE_GAS_DECREASE_LIQUIDITY
      : this.AVERAGE_GAS_REMOVE_LIQUIDITY;

    const gasInWei = estimatedGas * gasPrice;
    const gasFormatted = formatEther(gasInWei);

    const ethToken = tokens?.find(
      (t) => t.symbol.toUpperCase() === 'WETH'.toUpperCase(),
    );
    const gasUSD = (
      Number(gasFormatted) * Number(ethToken?.price || 0)
    ).toFixed(2);

    return {
      success: true,
      isSimulation: true,
      details: {
        poolSymbol,
        expectedToken0: formatUnits(amountToken0, token0?.decimals || 18),
        expectedToken1: formatUnits(amountToken1, token1?.decimals || 18),
      },
      token0Symbol: token0?.symbol || '',
      token1Symbol: token1?.symbol || '',
      token0USD,
      token1USD,
      gasFormatted,
      gasUSD,
      chainId,
    };
  }

  private async privyWithdraw(chainId: number, data: IWithdraw) {
    if (!data) {
      throw new Error('Invalid withdraw data');
    }

    const viemClient = this.viemService.getViemClient(chainId);

    const { toAddress: address, amountLiquidityToApproveBn, feeETH } = data;
    if (!address) {
      throw new Error('Invalid account');
    }

    const feeBn = BigInt(feeETH);
    let tx: Address | undefined;

    if (data.action === 'withdrawCL') {
      if (!data.nfpm) {
        throw new Error('Invalid nfpm');
      }

      await this.approveNft(chainId, data.nfpm, data.tokenId, address);

      const decreaseHash = (await this.privyService.sendTransaction(
        {
          viemClient,
          address: yamlConfig.SWAPPER_CONTRACTS[chainId],
          abi: getSwapperAbiViaChain(chainId),
          functionName: 'decreaseLiquidity',
          args: [
            {
              tokenId: BigInt(data.tokenId),
              liquidity: BigInt(data.liquidity),
              amount0Min: BigInt(data.amount0Min),
              amount1Min: BigInt(data.amount1Min),
              deadline: BigInt(data.deadline),
            },
            feeBn,
          ],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          value: feeBn,
          account: address,
        },
        false,
      )) as Address;

      const decreaseReceipt = await waitForTransactionReceipt(viemClient, {
        hash: decreaseHash as Address,
      });

      if (decreaseReceipt.status === 'reverted') {
        throw new Error('DecreaseLiquidity transaction reverted');
      }

      await this.approveNft(chainId, data.nfpm, data.tokenId, address);

      const collectHash = (await this.privyService.sendTransaction(
        {
          viemClient,
          address: yamlConfig.SWAPPER_CONTRACTS[chainId],
          abi: getSwapperAbiViaChain(chainId),
          functionName: 'collect',
          args: [
            {
              tokenId: BigInt(data.tokenId),
              recipient: address,
              amount0Max: maxUint128,
              amount1Max: maxUint128,
            },
            feeBn,
          ],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          value: feeBn,
          account: address,
        },
        false,
      )) as Address;

      const collectReceipt = await waitForTransactionReceipt(viemClient, {
        hash: collectHash,
      });

      if (collectReceipt.status === 'reverted') {
        throw new Error('Collect transaction reverted');
      }

      this.logger.log(
        `Successfully withdrawn CL position. Decrease hash: ${decreaseHash}, Collect hash: ${collectHash}`,
      );

      tx = collectHash as Address;
    } else if (data.action === 'withdrawAMM') {
      if (!amountLiquidityToApproveBn) {
        throw new Error('Invalid amountLiquidityToApproveBn');
      }

      const allowanceToken0 = await readContract(viemClient, {
        address: data.poolAddress,
        functionName: 'allowance',
        args: [address, yamlConfig.SWAPPER_CONTRACTS[chainId]],
        abi: erc20Abi,
      });

      if (allowanceToken0 < amountLiquidityToApproveBn) {
        await this.privyService.approve({
          viemClient,
          address: data.poolAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [
            yamlConfig.SWAPPER_CONTRACTS[chainId],
            amountLiquidityToApproveBn,
          ],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          account: address,
        });
      }

      const hash = (await this.privyService.sendTransaction({
        viemClient,
        address: yamlConfig.SWAPPER_CONTRACTS[chainId],
        abi: getSwapperAbiViaChain(chainId),
        functionName: 'removeLiquidity',
        args: [
          data.token0 as Address,
          data.token1 as Address,
          data.stable,
          data.liquidity,
          data.amount0Min,
          data.amount1Min,
          address as Address,
          data.deadline,
          feeBn,
        ],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: feeBn,
        account: address,
      })) as Address;

      tx = hash as Address;
    }

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async approveNft(
    chainId: number,
    nfpm: Address,
    tokenId: string,
    walletAddress: Address,
    spender: Address = yamlConfig.SWAPPER_CONTRACTS[chainId],
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    await this.privyService.approve({
      viemClient,
      address: nfpm,
      abi: erc721Abi,
      functionName: 'approve',
      args: [spender, BigInt(tokenId)],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      account: walletAddress,
    });
  }

  private async estimateApproveNft(
    chainId: number,
    walletAddress: Address,
    tokenContract: Address,
    tokenId: string,
    spender: Address = yamlConfig.SWAPPER_CONTRACTS[chainId],
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const contract = getContract({
      address: tokenContract,
      abi: erc721Abi,
      client: viemClient,
    });

    await contract.estimateGas.approve([spender, BigInt(tokenId)], {
      account: walletAddress,
    });
  }
}
