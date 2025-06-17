import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { randomUUID } from 'crypto';
import {
  Address,
  erc721Abi,
  formatEther,
  maxUint128,
  TransactionReceipt,
  zeroAddress,
} from 'viem';
import { PoolData, TokenResponse } from '../../../../../common/types';
import { getPoolsDataKey, getTokenInfoKey } from '../../cache/constants/keys';
import {
  IClaimFee,
  IClaimFeeError,
  IClaimFeeResult,
} from '../../../../../common/interfaces/actions/claime-fee.interface';
import { formatNumber } from '../../../../../common/utils/round-number';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import {
  IClaimEmission,
  IClaimEmissionError,
  IClaimEmissionResult,
} from '../../../../../common/interfaces/actions/claim-emission.interface';
import { AerodromeService } from '../aerodrome.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import { ViemService } from '../../viem/viem.service';
import { getTransactionReceipt, waitForTransactionReceipt } from 'viem/actions';
import { ammPoolContractAbi } from '../../../../../common/constants/chains/abis/amm-pl-contract.abi';
import { almAbi } from '../../../../../common/constants/chains/abis/alm.abi';
import { clGaugeAbi } from '../../../../../common/constants/chains/abis/cl-gauge.abi';
import { ammGaugeAbi } from '../../../../../common/constants/chains/abis/amm-gauge.abi';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { isArray } from 'lodash';
import { IToolError } from 'src/common/types/openai';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';

@Injectable()
export class AerodromeClaimerService {
  private readonly logger = new Logger(AerodromeClaimerService.name);

  constructor(
    private readonly aerodromeService: AerodromeService,
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
    private readonly privyService: PrivyService,
  ) {}

  async claimFeeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: Array<{ poolSymbol: string; positionId: string }>,
    isSimulation: boolean,
  ): Promise<
    | (IClaimFee | IClaimFeeError)[]
    | IToolError
    | (IClaimFeeResult | IClaimFeeError)[]
  > {
    const claimIdForLogs = `${user.id}_${randomUUID()}`;

    this.logger.log(
      `[Claim Fee: ${claimIdForLogs}]: Starting claim fee process`,
    );

    if (
      typeof isExternalChat !== 'boolean' ||
      typeof isSimulation !== 'boolean' ||
      !positions ||
      !Array.isArray(positions) ||
      !positions.length ||
      positions.every(
        (p) =>
          !p.poolSymbol ||
          typeof p.poolSymbol !== 'string' ||
          !p.positionId ||
          typeof p.positionId !== 'string',
      )
    ) {
      return {
        success: false,
        message:
          'Something went wrong. Invalid arguments was provided. Check positions',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      const walletAddress = user.wallets?.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        throw new Error(`Wallet ${walletAddress} not found`);
      }

      const pools = await this.cacheService.get<PoolData[]>(
        getPoolsDataKey(chainId),
      );

      if (!pools) {
        throw new Error('Pools not found');
      }

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        throw new Error('Tokens not found');
      }

      const userPositions = await this.aerodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
      );

      if (!userPositions || !Array.isArray(userPositions)) {
        throw new Error(`Positions list  not found in cache`);
      }

      const transactionData: (IClaimFee | IClaimFeeError)[] = [];

      const results: (IClaimFeeResult | IClaimFeeError)[] = [];

      for (let i = 0; i < positions.length; i++) {
        try {
          const { poolSymbol, positionId } = positions[i];

          const isClPool = this.aerodromeService.isCl(poolSymbol);

          const position = userPositions.find(
            (pos) =>
              pos.id.toString() === (isClPool ? positionId : '0') &&
              pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
          );

          if (!position) {
            const availablePositionsIds = userPositions
              .filter(
                (pos) => pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
              )
              .map((pos) => pos.id.toString());

            this.logger.error(`
             [Claim fee ]: ${claimIdForLogs} position with id:${positionId} not found
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

          if (
            Number(position.token0FeesEarned || 0) <= 0 &&
            Number(position.token1FeesEarned || 0) <= 0
          ) {
            this.logger.error(`
             [Claim fee ]: ${claimIdForLogs} Positions ${positionId} has no fees earned
            `);
            throw new Error(`Positions ${positionId} has no fees earned.`);
          }

          const isHasStakedTokens =
            Number(position.staked0 || 0) > 0 ||
            Number(position.staked1 || 0) > 0;

          if (isClPool && isHasStakedTokens) {
            this.logger.error(`
             [Claim fee ]: ${claimIdForLogs} Can't claim fee from ${poolSymbol} pool with staked tokens. Please unstake first
            `);
            throw new Error(
              `Can't claim fee from ${poolSymbol} pool with staked tokens. Please unstake first`,
            );
          }

          const targetPool = pools.find(
            (p) =>
              p.symbol.toUpperCase() === poolSymbol.toUpperCase() &&
              p.lp === position.lp,
          );

          if (!targetPool) {
            this.logger.error(`
             [Claim fee ]: ${claimIdForLogs} Pool ${poolSymbol} not found 
            `);
            throw new Error(`Pool ${poolSymbol} not found`);
          }

          const tokenETH = tokens?.find(
            (t) => t.symbol.toUpperCase() === 'WETH',
          );
          const gasPrice = await viemClient.getGasPrice();
          const gasBn = BigInt(200000) * gasPrice;
          const gasUsdWithoutFormatting =
            Number(tokenETH?.price || 0) * Number(formatEther(gasBn));
          const gasUSD = formatNumber(gasUsdWithoutFormatting, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0,
          });

          const token0Info = tokens?.find(
            (t) =>
              t.token_address.toLowerCase() === targetPool.token0.toLowerCase(),
          );

          const token1Info = tokens?.find(
            (t) =>
              t.token_address.toLowerCase() === targetPool.token1.toLowerCase(),
          );

          const { feeBn: first } = this.aerodromeService.calculateFee(
            Number(position.token0FeesEarned || 0),
            Number(token0Info?.price || 0),
            Number(tokenETH?.price || 0),
            yamlConfig.FEE_DETAILS.FEE_PCT,
            tokenETH?.decimals || 18,
          );
          const { feeBn: second } = this.aerodromeService.calculateFee(
            Number(position.token1FeesEarned || 0),
            Number(token1Info?.price || 0),
            Number(tokenETH?.price || 0),
            yamlConfig.FEE_DETAILS.FEE_PCT,
            tokenETH?.decimals || 18,
          );

          const feeBn = first + second;

          this.logger.log(`[Claim fee LP: ${claimIdForLogs}]: feeBn: ${feeBn}`);

          if (feeBn <= BigInt(0)) {
            this.logger.error(
              `[Claim fee LP: ${claimIdForLogs}]: Fee is less than 0`,
            );
            throw new Error('Fee is less or equal than 0. Increase amount');
          }

          const claimData: IClaimFee = {
            success: true,
            action: 'claimFee',
            poolSymbol: targetPool.symbol,
            positionId,
            token0FeesEarned: position.token0FeesEarned,
            token1FeesEarned: position.token1FeesEarned,
            token0Symbol: position.token0,
            token1Symbol: position.token1,
            token0FeesEarnedUSD: position.token0FeesEarnedUSD,
            token1FeesEarnedUSD: position.token1FeesEarnedUSD,
            gasFormatted: formatEther(gasBn),
            gasUSD,
            warningMessages: [],
            chainId,
            walletAddress,
            isClPool,
            poolAddress: targetPool.lp,
            tokenId: position.id,
            feeBn,
            nfpm: targetPool.nfpm as Address,
          };

          transactionData.push(claimData);

          const shouldExecuteWithoutConfirmation =
            user.should_execute_actions_without_confirmation;

          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            try {
              const result = await this.privyClaimFee(chainId, claimData);
              results.push({
                ...result,
                success: true,
                poolSymbol,
                action: 'claimFee',
                chainId,
              });
            } catch (error) {
              results.push({
                success: false,
                action: 'claimFee',
                isSimulation,
                poolSymbol,
                chainId,
                message: error.message,
              } as IClaimFeeError);
            }
          }
        } catch (error) {
          transactionData.push({
            success: false,
            action: 'claimFee',
            isSimulation,
            poolSymbol: positions[i].poolSymbol,
            positionId: positions[i].positionId,
            chainId,
            message: error.message,
          });
        }
      }

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return results;
      }

      return transactionData.map((transaction) => ({
        ...transaction,
        isSimulation,
        action: 'claimFee',
        chainId,
      }));
    } catch (error) {
      this.logger.error(`[Claim Fee: ${claimIdForLogs}]: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  async claimEmissionLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: Array<{ poolSymbol: string; positionId: string }>,
    isSimulation: boolean,
  ): Promise<
    | (IClaimEmission | IClaimEmissionError)[]
    | IToolError
    | (IClaimEmissionResult | IClaimEmissionError)[]
  > {
    const emissionsIdForLogs = `${user.id}_${randomUUID()}`;

    this.logger.log(
      `[Emession: ${emissionsIdForLogs}]: Starting emission process`,
    );

    if (
      typeof isExternalChat !== 'boolean' ||
      typeof isSimulation !== 'boolean' ||
      !positions ||
      !Array.isArray(positions) ||
      !positions.length ||
      positions.every(
        (p) =>
          !p.poolSymbol ||
          typeof p.poolSymbol !== 'string' ||
          !p.positionId ||
          typeof p.positionId !== 'string',
      )
    ) {
      return {
        success: false,
        message:
          'Something went wrong. Invalid arguments was provided. Check positions',
      };
    }

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      const walletAddress = user.wallets?.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        throw new Error(`Wallet ${walletAddress} not found`);
      }

      const pools = await this.cacheService.get<PoolData[]>(
        getPoolsDataKey(chainId),
      );

      if (!pools) {
        throw new Error('Pools not found');
      }

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        throw new Error('Tokens not found');
      }

      const cachePositions = await this.aerodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        null,
        false,
      );

      if (!cachePositions || !Array.isArray(cachePositions)) {
        throw new Error('Positions not found');
      }

      const transactionData: (IClaimEmission | IClaimEmissionError)[] = [];

      const results: (IClaimEmissionResult | IClaimEmissionError)[] = [];

      for (let i = 0; i < positions.length; i++) {
        try {
          const { poolSymbol, positionId } = positions[i];
          const warningMessages: string[] = [];

          const isClPool = this.aerodromeService.isCl(poolSymbol);

          const position = cachePositions.find(
            (pos) =>
              pos.id.toString() === (isClPool ? positionId : '0') &&
              pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
          );

          if (!position) {
            const availablePositionsIds = cachePositions
              .filter(
                (pos) => pos.symbol?.toUpperCase() === poolSymbol.toUpperCase(),
              )
              .map((pos) => pos.id.toString());

            this.logger.error(`
             [Emission ]: ${emissionsIdForLogs} position with id:${positionId} not found
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

          if (Number(position.emissionsEarned || 0) <= 0) {
            this.logger.error(`
             [Emission ]: ${emissionsIdForLogs} Positions ${positionId} has no emissions earned
            `);
            throw new Error(`Positions ${positionId} has no emissions earned.`);
          }

          const targetPool = pools.find(
            (p) =>
              p.symbol.toUpperCase() === poolSymbol.toUpperCase() &&
              p.lp === position.lp,
          );

          if (!targetPool) {
            this.logger.error(`
             [Emission]: ${emissionsIdForLogs} Pool ${poolSymbol} not found 
            `);
            throw new Error(`Pool ${poolSymbol} not found`);
          }

          const isAlmPool = isClPool && position.alm !== zeroAddress;
          const tokenETH = tokens?.find(
            (t) => t.symbol.toUpperCase() === 'WETH',
          );
          const gasPrice = await viemClient.getGasPrice();
          const gasBn = BigInt(200000) * gasPrice;
          const gasUsdWithoutFormatting =
            Number(tokenETH?.price || 0) * Number(formatEther(gasBn));
          const gasUSD = formatNumber(gasUsdWithoutFormatting, {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0,
          });

          const emissionToken = tokens?.find(
            (t) =>
              t.token_address.toLowerCase() ===
              (position.emissionsTokenAddress || '').toLowerCase(),
          );

          const { feeBn } = this.aerodromeService.calculateFee(
            Number(position.emissionsEarned || 0),
            Number(emissionToken?.price || 0),
            Number(tokenETH?.price || 0),
            yamlConfig.FEE_DETAILS.FEE_PCT,
            tokenETH?.decimals || 18,
          );

          this.logger.log(`[Emission: ${emissionsIdForLogs}]: feeBn: ${feeBn}`);

          if (feeBn <= BigInt(0)) {
            this.logger.error(
              `[Emission: ${emissionsIdForLogs}]: Fee is less than 0`,
            );
            throw new Error('Fee is less or equal than 0. Increase amount');
          }

          const rewardData: IClaimEmission = {
            success: true,
            action: 'claimEmission',
            walletAddress,
            isClPool,
            tokenId: position.id,
            feeBn,
            gauge: targetPool.gauge,
            isAlmPool,
            alm: position.alm,
            poolSymbol: targetPool.symbol,
            positionId,
            emissionsEarned: position.emissionsEarned,
            emissionsEarnedUSD: position.emissionsEarnedUSD,
            emissionToken: position.emissionsToken || 'AERO',
            gasFormatted: formatEther(gasBn),
            gasUSD,
            warningMessages,
            chainId,
          };

          transactionData.push(rewardData);

          const shouldExecuteWithoutConfirmation =
            user.should_execute_actions_without_confirmation;

          if (
            (isExternalChat && !isSimulation) ||
            (isExternalChat && shouldExecuteWithoutConfirmation)
          ) {
            try {
              const result = await this.privyClaimEmission(chainId, rewardData);
              results.push({
                ...result,
                poolSymbol,
                action: 'claimEmission',
                chainId,
                success: true,
              });
            } catch (error) {
              results.push({
                success: false,
                isSimulation,
                message: error.message,
                action: 'claimEmission',
                chainId,
              });
            }
          }
        } catch (error) {
          transactionData.push({
            success: false,
            action: 'claimEmission',
            isSimulation,
            chainId,
            message: error.message,
            poolSymbol: positions[i].poolSymbol,
            positionId: positions[i].positionId,
          });
        }
      }

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return results;
      }

      return transactionData.map((transaction) => ({
        ...transaction,
        isSimulation,
        action: 'claimEmission',
        chainId,
      }));
    } catch (error) {
      this.logger.error(
        `[Emission rewards: ${emissionsIdForLogs}]: ${error.message}`,
      );

      return {
        success: false,
        message: error.message,
      };
    }
  }

  async claimAllRewards(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: Array<{ poolSymbol: string; positionId: string }>,
    isSimulation: boolean,
  ) {
    const claimAllLogId = `${crypto.randomUUID()}_${user.id}`;

    this.logger.log(
      `[Claim All Rewards: ${claimAllLogId}]: Starting claim all rewards process`,
    );

    const resultList: (
      | IClaimFee
      | IClaimFeeError
      | IClaimFeeResult
      | IClaimEmission
      | IClaimEmissionError
      | IClaimEmissionResult
    )[] = [];

    const errorMessages: string[] = [];

    const claimFeeResult = await this.claimFeeLp(
      user,
      isExternalChat,
      chainId,
      positions,
      isSimulation,
    );

    if (isArray(claimFeeResult)) {
      resultList.push(...claimFeeResult);
    } else {
      if (
        'message' in claimFeeResult &&
        typeof claimFeeResult.message === 'string' &&
        'success' in claimFeeResult &&
        !claimFeeResult.success
      ) {
        errorMessages.push(claimFeeResult.message);
      } else {
        errorMessages.push(
          'Something went wrong on claiming fees proccess. Please try again later',
        );
      }
    }

    const claimEmissionResult = await this.claimEmissionLp(
      user,
      isExternalChat,
      chainId,
      positions,
      isSimulation,
    );

    if (isArray(claimEmissionResult)) {
      resultList.push(...claimEmissionResult);
    } else {
      if (
        'message' in claimEmissionResult &&
        typeof claimEmissionResult.message === 'string' &&
        'success' in claimEmissionResult &&
        !claimEmissionResult.success
      ) {
        errorMessages.push(claimEmissionResult.message);
      } else {
        errorMessages.push(
          'Something went wrong on claiming emissions proccess. Please try again later',
        );
      }
    }

    if (errorMessages.length > 0) {
      return {
        success: false,
        message: errorMessages.join(' \n'),
      };
    }

    return resultList;
  }

  private async privyClaimFee(
    chainId: number,
    data: IClaimFee,
  ): Promise<{
    success: boolean;
    isSimulation: boolean;
    receipt?: TransactionReceipt;
  }> {
    const {
      walletAddress: address,
      isClPool,
      tokenId,
      nfpm,
      feeBn,
      poolAddress,
    } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    let tx: Address | undefined;
    try {
      if (isClPool) {
        await this.approveNft(
          chainId,
          nfpm,
          tokenId.toString(),
          address,
          yamlConfig.SWAPPER_CONTRACTS[chainId],
        );

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
          hash: collectHash as Address,
        });

        if (collectReceipt.status === 'reverted') {
          throw new Error('Collect transaction reverted');
        }

        this.logger.log(
          `Successfully claimed fee for CL position. Collect hash: ${collectHash}`,
        );

        tx = collectHash as Address;
      } else {
        const claimHash = (await this.privyService.sendTransaction(
          {
            viemClient,
            address: poolAddress,
            abi: ammPoolContractAbi,
            functionName: 'claimFees',
            args: undefined,
            chain: MAP_CHAIN_ID_CHAIN[chainId],
            value: undefined,
            account: address,
          },
          false,
        )) as Address;

        const claimReceipt = await waitForTransactionReceipt(viemClient, {
          hash: claimHash as Address,
        });

        if (claimReceipt.status === 'reverted') {
          throw new Error('Claim transaction reverted');
        }

        this.logger.log(
          `Successfully claimed fee for CL position. Claim hash: ${claimHash}`,
        );

        tx = claimHash as Address;
      }

      if (!tx) {
        throw new Error('Invalid transaction');
      }

      const receipt = await getTransactionReceipt(viemClient, {
        hash: tx,
      });

      return { ...receipt, success: true, isSimulation: false };
    } catch (error) {
      this.logger.error(`[Claim Fee]: ${error.message}`);
      throw new Error('Transaction fails');
    }
  }

  private async privyClaimEmission(
    chainId: number,
    data: IClaimEmission,
  ): Promise<{
    success: boolean;
    isSimulation: boolean;
    receipt?: TransactionReceipt;
  }> {
    const { walletAddress, isClPool, tokenId, gauge, isAlmPool, alm } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    let tx: Address | undefined;
    try {
      if (isAlmPool) {
        const rewardClAlmHash = (await this.privyService.sendTransaction(
          {
            viemClient,
            address: alm,
            abi: almAbi,
            functionName: 'getRewards',
            args: [walletAddress],
            chain: MAP_CHAIN_ID_CHAIN[chainId],
            value: undefined,
            account: walletAddress as Address,
          },
          false,
        )) as Address;

        const rewardClAlmReceipt = await waitForTransactionReceipt(viemClient, {
          hash: rewardClAlmHash as Address,
        });

        if (rewardClAlmReceipt.status === 'reverted') {
          throw new Error('Collect transaction reverted');
        }

        this.logger.log(
          `[Emission rewards] Successfully for ALM position. Collect hash: ${rewardClAlmHash}`,
        );

        tx = rewardClAlmHash as Address;
      } else if (isClPool) {
        /**
         * @see(https://github.com/velodrome-finance/docs/blob/main/content/sdk.mdx#emissions-claiming-1)
         * Concentrated Pools
         * Emissions Claiming
         *
         * To claim emissions for a staked deposit,
         * call the Gauge contract function getReward()
         * passing the deposit NFT id.
         */
        const rewardCLHash = (await this.privyService.sendTransaction(
          {
            viemClient,
            address: gauge,
            abi: clGaugeAbi,
            functionName: 'getReward',
            args: [tokenId],
            chain: MAP_CHAIN_ID_CHAIN[chainId],
            value: undefined,
            account: walletAddress as Address,
          },
          false,
        )) as Address;

        const rewardCLReceipt = await waitForTransactionReceipt(viemClient, {
          hash: rewardCLHash as Address,
        });

        if (rewardCLReceipt.status === 'reverted') {
          throw new Error('Collect transaction reverted');
        }

        this.logger.log(
          `[Emission rewards] Successfully for CL position. Collect hash: ${rewardCLHash}`,
        );

        tx = rewardCLHash as Address;
      } else {
        /**
         * @see(https://github.com/velodrome-finance/docs/blob/main/content/sdk.mdx#emissions-claiming)
         * Base Pools
         * Emissions Claiming
         *
         * To claim emissions for a staked deposit,
         * call the Gauge contract function getReward()
         * passing the LP depositor address.
         */
        const rewardBaseHash = (await this.privyService.sendTransaction(
          {
            viemClient,
            address: gauge,
            abi: ammGaugeAbi,
            functionName: 'getReward',
            args: [walletAddress],
            chain: MAP_CHAIN_ID_CHAIN[chainId],
            value: undefined,
            account: walletAddress as Address,
          },
          false,
        )) as Address;

        const rewardBaseReceipt = await waitForTransactionReceipt(viemClient, {
          hash: rewardBaseHash as Address,
        });

        if (rewardBaseReceipt.status === 'reverted') {
          throw new Error('Claim emission transaction reverted');
        }

        this.logger.log(
          `[Emission rewards] Successfully for Base position. Claim emission hash: ${rewardBaseHash}`,
        );

        tx = rewardBaseHash as Address;
      }

      if (!tx) {
        throw new Error('Invalid transaction');
      }

      const receipt = await getTransactionReceipt(viemClient, {
        hash: tx,
      });

      return { ...receipt, success: true, isSimulation: false };
    } catch (error) {
      this.logger.error(`[Emission rewards]: ${error.message}`);
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
}
