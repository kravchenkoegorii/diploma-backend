import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { isBoolean, isNumber, isString } from 'class-validator';
import {
  Address,
  erc20Abi,
  erc721Abi,
  formatEther,
  formatUnits,
  zeroAddress,
} from 'viem';
import { PoolData, TokenResponse } from '../../../../../common/types';
import { getPoolsDataKey, getTokenInfoKey } from '../../cache/constants/keys';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import { formatNumber } from '../../../../../common/utils/round-number';
import { IStake } from '../../../../../common/interfaces/actions/stake';
import { IUnstake } from '../../../../../common/interfaces/actions/unstake.interface';
import { ViemService } from '../../viem/viem.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import { getTransactionReceipt, readContract } from 'viem/actions';
import { clGaugeAbi } from '../../../../../common/constants/chains/abis/cl-gauge.abi';
import { ammGaugeAbi } from '../../../../../common/constants/chains/abis/amm-gauge.abi';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { VelodromeService } from '../velodrome.service';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';

@Injectable()
export class VelodromeStakerService {
  private readonly logger = new Logger(VelodromeStakerService.name);

  private readonly AVERAGE_GAS_DEPOSIT_AMM_LIQUIDITY = BigInt(261000);
  private readonly AVERAGE_GAS_UNSTAKE_LIQUIDITY = BigInt(400000);

  constructor(
    private readonly velodromeService: VelodromeService,
    private readonly viemService: ViemService,
    private readonly cacheService: CacheService,
    private readonly privyService: PrivyService,
  ) {}

  async stakeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    isSimulation = true,
  ) {
    const stakeIdForLogs = crypto.randomUUID();

    if (
      !isBoolean(isSimulation) ||
      !isNumber(amount) ||
      !isString(positionId) ||
      !isString(poolSymbol)
    ) {
      return {
        success: false,
        message: 'Something went wrong. Please try again',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (amount <= 0 || amount > 1) {
        throw new Error('Invalid amount');
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address | undefined;

      if (!walletAddress) {
        throw new Error('Wallet not found');
      }

      const pools = await this.cacheService.get<PoolData[]>(
        getPoolsDataKey(chainId),
      );

      const positions = await this.velodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
      );

      if (!positions || !Array.isArray(positions)) {
        this.logger.error(`[STAKE: ${stakeIdForLogs}]: Positions not found`);
        throw new Error('Positions not found');
      }

      const isClPool = this.velodromeService.isCl(poolSymbol);

      const position = positions.find(
        (pos) =>
          pos.id.toString() === (isClPool ? positionId : '0') &&
          pos.symbol?.toLowerCase() === poolSymbol?.toLowerCase(),
      );

      if (!position) {
        const availablePositionsIds = positions
          .filter(
            (pos) => pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
          )
          .map((pos) => pos.id.toString());

        this.logger.error(`
             [STAKE ]: ${stakeIdForLogs} position with id:${positionId} not found
            `);

        throw new Error(
          `Position ${poolSymbol} with id:${positionId} not found. ${
            availablePositionsIds.length
              ? ` Avalaible positions ids are: ${availablePositionsIds.join(
                  ', ',
                )}`
              : ''
          }`,
        );
      }

      const targetPool = pools?.find(
        (p) =>
          p.symbol.toLowerCase() === poolSymbol.toLowerCase() &&
          position.lp.toLowerCase() === p.lp.toLowerCase(),
      );

      if (!targetPool) {
        this.logger.error(
          `[Stake: ${stakeIdForLogs}]: Pool ${poolSymbol} not found`,
        );

        throw new Error(`Pool ${poolSymbol} not found`);
      }

      if (!targetPool?.gauge_alive) {
        this.logger.error(
          `[Stake: ${stakeIdForLogs}]: Pool ${poolSymbol} is not active`,
        );
        throw new Error(
          `This ${poolSymbol} [address](${targetPool.lp}) pool  is no longer active`,
        );
      }

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        this.logger.error(`[Stake LP: ${stakeIdForLogs}]: Tokens not found`);
        throw new Error('Tokens not found');
      }

      const isAlmPool = isClPool && position.alm !== zeroAddress;

      if (isAlmPool) {
        throw new Error(
          `Position ${poolSymbol} with ID ${positionId} is managed by Automated Liquidity Management (ALM), so it cannot be staked.`,
        );
      }

      if (Number(position.liquidity || 0) <= 0) {
        this.logger.error(`
             [STAKE]: ${stakeIdForLogs} Positions ${positionId} has liquidity}
            `);
        throw new Error(`Positions ${positionId} has no liquidity}`);
      }

      const totalLiquidity = BigInt(position.liquidity);
      const amountBn = BigInt(Math.floor(Number(totalLiquidity) * amount));
      const amountToApproveBN =
        amountBn + BigInt(Math.trunc(+amountBn.toString() * 0.001));

      const token0Info = tokens?.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token0.toLowerCase(),
      );

      const token1Info = tokens?.find(
        (t) =>
          t.token_address.toLowerCase() === targetPool.token1.toLowerCase(),
      );
      const tokenETH = tokens?.find((t) => t.symbol.toUpperCase() === 'WETH');

      const { feeBn: firsTokenFeeBn } = this.velodromeService.calculateFee(
        +formatUnits(position.amount0, token0Info?.decimals || 18),
        Number(token0Info?.price || 0),
        Number(tokenETH?.price || 0),
        yamlConfig.FEE_DETAILS.FEE_PCT,
        tokenETH?.decimals || 18,
      );

      const { feeBn: secondTokenFeeBn } = this.velodromeService.calculateFee(
        +formatUnits(position.amount1, token1Info?.decimals || 18),
        Number(token1Info?.price || 0),
        Number(tokenETH?.price || 0),
        yamlConfig.FEE_DETAILS.FEE_PCT,
        tokenETH?.decimals || 18,
      );
      const feeBn = firsTokenFeeBn + secondTokenFeeBn;

      this.logger.log(`[Stake LP: ${stakeIdForLogs}]: feeBn: ${feeBn}`);

      if (feeBn <= BigInt(0)) {
        this.logger.error(`[Stake LP: ${stakeIdForLogs}]: Fee is less than 0`);

        throw new Error(
          'Fee is less or equal than 0.Check amount. Might to increase amount',
        );
      }

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = this.AVERAGE_GAS_DEPOSIT_AMM_LIQUIDITY * gasPrice;
      const ethToken = tokens?.find(
        (t) => t.symbol.toUpperCase() === 'WETH'.toUpperCase(),
      );
      const gasUsdWithoutFormatting =
        Number(ethToken?.price || 0) * Number(formatEther(gasBn * BigInt(2)));
      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });

      if (isSimulation) {
        const warningMessages: string[] = [];

        if (isClPool && amount < 1) {
          warningMessages.push(
            `Unfortunately, it is currently not possible to stake a specific amount of LP tokens in the CL pool ${poolSymbol}. You can only stake 100% of your available  LP tokens.`,
          );
        }

        const amountBnComputed = isClPool ? BigInt(totalLiquidity) : amountBn;

        const amountFormatted = formatUnits(
          amountBn,
          targetPool.decimals || 18,
        );

        const token1StakeAmount = (
          Number(
            formatUnits(position.amount1, position?.token1Decimals || 18),
          ) * amount
        ).toFixed(6);
        const token0StakeAmount = (
          Number(
            formatUnits(position.amount0, position?.token0Decimals || 18),
          ) * amount
        ).toFixed(6);
        const token1StakeAmountUSD = (
          Number(position.amount1USD) * amount
        ).toFixed(6);
        const token0StakeAmountUSD = (
          Number(position.amount0USD) * amount
        ).toFixed(6);

        return {
          success: true,
          isSimulation,
          poolSymbol: targetPool.symbol,
          amountBn: amountBnComputed,
          amountFormatted: Number(amountFormatted).toFixed(6),
          estimatedApr: Number(targetPool.apr || 0).toFixed(6),
          positionId,
          feeBn,
          gasFormatted: formatEther(gasBn * BigInt(2)),
          gasUSD,
          warningMessages,
          chainId,
          token0StakeAmount,
          token1StakeAmount,
          token0Symbol: position.token0Symbol,
          token1Symbol: position.token1Symbol,
          token1StakeAmountUSD,
          token0StakeAmountUSD,
        };
      }

      const stakeData: IStake = {
        walletAddress,
        lpToken: targetPool.lp,
        amountToApproveBN,
        amountBN: amountBn,
        isClPool,
        feeBn,
        gauge: targetPool.gauge,
        tokenId: position.id.toString(),
        nfpm: targetPool.nfpm as Address,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyStake(chainId, stakeData);
      }

      return {
        success: true,
        action: 'stake',
        isSimulation,
        ...stakeData,
        chainId,
      };
    } catch (error) {
      this.logger.error(`[Stake LP: ${stakeIdForLogs}]: ${error.message}`);

      return {
        success: false,
        message: error.message,
      };
    }
  }

  async unstakeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    isSimulation: boolean,
  ) {
    const unstakeIdForLogs = crypto.randomUUID();
    // validate arguments
    if (
      !isBoolean(isSimulation) ||
      !isNumber(amount) ||
      !isString(positionId) ||
      !isString(poolSymbol)
    ) {
      return {
        success: false,
        message:
          'Arguments are not valid. Something went wrong. Please try again',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      this.logger.log(
        `[Unstake LP: ${unstakeIdForLogs}]: Unstaking from pool ${poolSymbol}. User: ${user.id}`,
      );

      if (!positionId) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Amount ${positionId}`,
        );
        throw new Error(`Cant get position ID ${positionId}`);
      }

      const tokensCacheKey = getTokenInfoKey(chainId);
      const tokens = await this.cacheService.get<TokenResponse[]>(
        tokensCacheKey,
      );

      if (!tokens) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Tokens not found`,
        );
        throw new Error('Can`t get tokens info');
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address | undefined;

      if (!walletAddress) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Wallet not found`,
        );
        throw new Error('Wallet not found');
      }

      const positions = await this.velodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
      );

      if (!positions || !Array.isArray(positions)) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Positions not found`,
        );
        throw new Error('Positions not available');
      }

      const position = positions.find(
        (pos) =>
          pos.id.toString() === positionId &&
          pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
      );

      if (!position) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Position ${positionId} not found`,
        );
        throw new Error(`Position ${positionId} not found`);
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
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: Pool ${poolSymbol} not found`,
        );
        throw new Error(`Pool  ${poolSymbol} not found`);
      }

      if (!position.staked || position.staked <= BigInt(0)) {
        this.logger.error(
          `[Unstake LP: ${unstakeIdForLogs}]: No staked tokens found in  position ${positionId} value ${position.staked}`,
          position,
        );
        throw new Error(
          `No staked tokens found in this position ${positionId}`,
        );
      }

      const isClPool = Number(targetPool.type) >= 1;
      const isAlmPool = isClPool && position.alm !== zeroAddress;

      if (isAlmPool) {
        throw new Error(
          `Position ${poolSymbol} with ID ${positionId} is managed by Automated Liquidity Management (ALM), so it cannot be unstaked.`,
        );
      }

      const totalStaked = BigInt(position.staked);
      const amountBn = BigInt(Math.floor(Number(totalStaked) * amount));

      const amountToApproveBn =
        amountBn + BigInt(Math.trunc(+amountBn.toString() * 0.001));

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = this.AVERAGE_GAS_UNSTAKE_LIQUIDITY * gasPrice;
      const ethToken = tokens?.find(
        (t) => t.symbol.toUpperCase() === 'WETH'.toUpperCase(),
      );
      const gasUsdWithoutFormatting =
        Number(ethToken?.price || 0) * Number(formatEther(gasBn * BigInt(2)));
      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });

      const feeBn = BigInt(0); //TODO: need to apply real FEE when swap_manager will implement unstake (withdraw method)

      this.logger.log(`[Unstake LP: ${unstakeIdForLogs}]: feeBn: ${feeBn}`);

      if (isSimulation) {
        const warningMessages: string[] = [];

        if (isClPool && amount < 1) {
          warningMessages.push(
            `Unfortunately, it is currently not possible to unstake a specific amount of LP tokens in the CL pool ${poolSymbol}. You can only unstake 100% of your available  LP tokens.`,
          );
        }

        const token1UnstakeAmount = (
          Number(
            formatUnits(position.staked1, position?.token1Decimals || 18),
          ) * amount
        ).toFixed(6);
        const token0UnstakeAmount = (
          Number(
            formatUnits(position.staked0, position?.token0Decimals || 18),
          ) * amount
        ).toFixed(6);
        const token1UnstakeAmountUSD = (
          Number(position.staked1USD) * amount
        ).toFixed(6);
        const token0UnstakeAmountUSD = (
          Number(position.staked0USD) * amount
        ).toFixed(6);

        return {
          isSimulation,
          success: true,
          poolSymbol: targetPool.symbol,
          decimals: targetPool.decimals || 18,
          amountBn: isClPool ? BigInt(totalStaked) : amountBn,
          positionId,
          feeBn,
          gasFormatted: formatEther(gasBn * BigInt(2)),
          gasUSD,
          warningMessages,
          chainId,
          token0Symbol: position.token0Symbol,
          token1Symbol: position.token1Symbol,
          token0UnstakeAmount,
          token1UnstakeAmount,
          token0UnstakeAmountUSD,
          token1UnstakeAmountUSD,
        };
      }

      const unstakeData: IUnstake = {
        walletAddress,
        isAlmPool,
        isClPool,
        lpToken: targetPool.lp,
        amountBn,
        amountToApproveBn,
        feeBn,
        gauge: targetPool.gauge,
        tokenId: position.id,
        nfpm: targetPool.nfpm as Address,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return this.privyUnStake(chainId, unstakeData);
      }

      return {
        success: true,
        action: 'unstake',
        isSimulation,
        ...unstakeData,
        chainId,
      };
    } catch (error) {
      this.logger.error(`[Unstake LP] ${unstakeIdForLogs}`, error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  private async privyStake(chainId: number, data: IStake) {
    const {
      feeBn,
      isClPool,
      lpToken,
      gauge,
      walletAddress,
      amountBN,
      amountToApproveBN,
      tokenId,
      nfpm,
    } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (isClPool) {
        await this.approveNft(chainId, nfpm, tokenId, walletAddress, gauge);

        const tx = (await this.privyService.sendTransaction({
          viemClient,
          address: gauge,
          abi: clGaugeAbi,
          functionName: 'deposit',
          args: [BigInt(tokenId)],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          value: undefined,
          account: walletAddress,
        })) as Address;

        if (!tx) {
          throw new Error('Invalid transaction');
        }

        const receipt = await getTransactionReceipt(viemClient, {
          hash: tx,
        });

        return { ...receipt, success: true, isSimulation: false, chainId };
      }
      await this.approveTokenERC20(
        chainId,
        walletAddress,
        lpToken,
        amountToApproveBN,
      );

      const tx = (await this.privyService.sendTransaction({
        viemClient,
        address: yamlConfig.SWAPPER_CONTRACTS[chainId],
        abi: getSwapperAbiViaChain(chainId),
        functionName: 'depositAMM',
        args: [lpToken, amountBN, walletAddress, feeBn],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: feeBn,
        account: walletAddress,
      })) as Address;

      if (!tx) {
        throw new Error('Invalid transaction');
      }

      const receipt = await getTransactionReceipt(viemClient, {
        hash: tx,
      });

      return { ...receipt, success: true, isSimulation: false, chainId };
    } catch (error) {
      this.logger.error(`[Stake LP:${lpToken}]: ${error.message}`);
      throw new Error('Transaction fails');
    }
  }

  private async privyUnStake(chainId: number, data: IUnstake) {
    const { isClPool, lpToken, gauge, walletAddress, amountBn, tokenId } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (isClPool) {
        const tx = (await this.privyService.sendTransaction({
          viemClient,
          address: gauge,
          abi: clGaugeAbi,
          functionName: 'withdraw',
          args: [tokenId],
          chain: MAP_CHAIN_ID_CHAIN[chainId],
          value: undefined,
          account: walletAddress,
        })) as Address;

        if (!tx) {
          throw new Error('Invalid transaction');
        }

        const receipt = await getTransactionReceipt(viemClient, {
          hash: tx,
        });

        return { ...receipt, success: true, isSimulation: false, chainId };
      }

      const tx = (await this.privyService.sendTransaction({
        viemClient,
        address: gauge,
        abi: ammGaugeAbi,
        functionName: 'withdraw',
        args: [amountBn],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        value: undefined,
        account: walletAddress,
      })) as Address;

      if (!tx) {
        throw new Error('Invalid transaction');
      }

      const receipt = await getTransactionReceipt(viemClient, {
        hash: tx,
      });

      return { ...receipt, success: true, isSimulation: false, chainId };
    } catch (error) {
      this.logger.error(`[Unstake :${lpToken}]: ${error.message}`);
      throw new Error('Transaction fails');
    }
  }

  private async approveNft(
    chainId: number,
    nfpm: Address,
    tokenId: string,
    walletAddress: Address,
    spender: Address,
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

  private async approveTokenERC20(
    chainId: number,
    walletAddress: Address,
    token_address: Address,
    amountToApproveBN: bigint,
    spender: Address = yamlConfig.SWAPPER_CONTRACTS[chainId],
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const allowance = await readContract(viemClient, {
      address: token_address as Address,
      functionName: 'allowance',
      args: [walletAddress, spender],
      abi: erc20Abi,
    });

    this.logger.log('Approval', {
      allowance,
      amountToApproveBN,
    });

    if (allowance < amountToApproveBN) {
      await this.privyService.approve({
        viemClient,
        address: token_address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amountToApproveBN],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        account: walletAddress,
      });
    }
  }
}
