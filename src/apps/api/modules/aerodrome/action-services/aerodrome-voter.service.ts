import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import {
  Address,
  erc721Abi,
  formatEther,
  formatUnits,
  parseUnits,
  zeroAddress,
} from 'viem';
import {
  IVotingReward,
  PoolData,
  TokenResponse,
} from '../../../../../common/types';
import {
  getPoolsDataKey,
  getTokenInfoKey,
  getVotingRewardsKey,
} from '../../cache/constants/keys';
import { AerodromeService } from '../aerodrome.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import { chainsConfig } from '../../../../../common/constants/chains';
import { getTransactionReceipt } from 'viem/actions';
import { voterAbi } from '../../../../../common/constants/chains/abis/voter.abi';
import { ViemService } from '../../viem/viem.service';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { IClaimVotingReward } from 'src/common/interfaces/actions/claim-voting-reward';
import { formatNumber } from 'src/common/utils/round-number';
import { yamlConfig } from 'src/common/configs/yaml.config';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';

@Injectable()
export class AerodromeVoterService {
  private readonly logger = new Logger(AerodromeVoterService.name);

  constructor(
    private readonly aerodromeService: AerodromeService,
    private readonly cacheService: CacheService,
    private readonly privyService: PrivyService,
    private readonly viemService: ViemService,
  ) {}

  async vote(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    pools: Array<{ symbol: string; power: string }>,
    isSimulation: boolean,
  ) {
    const lockIdBN = BigInt(lockId);

    const voteId = `${user.id}_${crypto.randomUUID()}`;

    this.logger.log(`[Voting: ${voteId}]: Starting pools voting process`);

    if (!lockId) {
      this.logger.error(`[Voting: ${voteId}]: Lock ID not found in arguments`);
      return {
        success: false,
        message: 'Invalid arguments was provided. Check lock ID.',
      };
    }

    if (!pools?.length) {
      this.logger.error(
        `[Voting: ${voteId}]: Pools for voting not found in arguments`,
      );
      return {
        success: false,
        message: 'Invalid arguments was provided. Check pools for voting.',
      };
    }

    const walletAddress = user.wallets.find(
      (wallet) => wallet.isDefault,
    )?.address;

    if (!walletAddress) {
      this.logger.error(
        `[Voting: ${voteId}]: User wallet ${walletAddress} not found`,
      );
      return {
        success: false,
        message: `User wallet not found.`,
      };
    }

    try {
      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress as Address,
      );

      const lock = userLocks.find((ul) => ul.id === lockIdBN);

      if (!lock) {
        this.logger.error(`[Voting: ${voteId}]: Lock ${lockId} not found`);
        return {
          success: false,
          message: `Lock ${lockId} not found.`,
        };
      }

      if (lock.votes.length > 0) {
        this.logger.error(`[Voting: ${voteId}]: Lock ${lockId} already used`);
        return {
          success: false,
          message: `Lock ${lockId} already used. Choose or create another one.`,
        };
      }

      const cachedPools = (
        (await this.cacheService.get<PoolData[]>(getPoolsDataKey(chainId))) ||
        []
      ).filter((pool) => pool.gauge_alive);

      if (!cachedPools) {
        this.logger.error(`[Voting: ${voteId}]: Pools not found`);
        return {
          success: false,
          message: `Pools not found.`,
        };
      }

      const poolsAddresses = pools
        .map(
          (pool) =>
            cachedPools.find(
              (cp) => cp.symbol.toLowerCase() === pool.symbol.toLowerCase(),
            )?.lp,
        )
        .filter((addr) => addr !== undefined);

      if (poolsAddresses.length !== pools.length) {
        this.logger.error(`[Voting: ${voteId}]: Some pools not found in cache`);
        return {
          success: false,
          message: `Some pools not found in cache.`,
        };
      }

      const summaryVotingPower = pools.reduce(
        (sum, item) => sum + Number(item.power),
        0,
      );

      if (summaryVotingPower !== 100) {
        this.logger.error(
          `[Voting: ${voteId}]: Summary voting power is not 100%`,
        );
        return {
          success: false,
          message: `[Voting: ${voteId}]: Summary voting power is not 100%.`,
        };
      }

      const powers = pools.map((pool) =>
        parseUnits(pool.power, lock.decimals || 18),
      );

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyVote(
          chainId,
          walletAddress as Address,
          lockIdBN,
          poolsAddresses,
          powers,
        );
      }

      return {
        success: true,
        isSimulation,
        tokenId: lockIdBN,
        pools: poolsAddresses,
        poolsNames: pools.map((pool) => pool.symbol),
        poolsPowers: pools.map((pool) => pool.power),
        amount: formatUnits(lock.amount, lock.decimals || 18),
        powers,
        chainId,
      };
    } catch (error) {
      this.logger.error(
        `[Voting: ${voteId}]: Error occurred during voting: ${error.message}.`,
      );

      return {
        success: false,
        message: error?.message || 'Something went wrong',
      };
    }
  }

  async claimVotingRewards(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      votesIds: number[];
      isSimulation: boolean;
      chainId: number;
    },
  ) {
    const { votesIds, isSimulation, chainId } = args;

    const idForLogs = `${user.id}_${crypto.randomUUID()}`;
    const successMessages: {
      success: true;
      isSimulation: boolean;
      venftId: number;
      [key: string]: any;
    }[] = [];

    const errorMessages: {
      votesIds: number[] | null;
      success: false;
      isSimulation: boolean;
      message: string;
    }[] = [];

    const walletAddress = user.wallets.find(
      (wallet) => wallet.isDefault,
    )?.address;

    if (!walletAddress) {
      this.logger.error(
        `[CLAIM VOTING REWARDS: ${idForLogs}]: User wallet ${walletAddress} not found`,
      );
      return {
        success: false,
        message: `User wallet not found.`,
      };
    }

    const votingRewards = await this.aerodromeService.getVotingRewards(
      chainId,
      walletAddress as Address,
    );

    this.logger.log(
      `[CLAIM VOTING REWARDS: ${idForLogs}]:Starting claiming voting rewards process`,
    );

    const votesIdsFormatted = votesIds?.map((id) =>
      typeof id === 'number' ? id : Number(id),
    );

    const selectedRewards = !!votesIds?.length
      ? votingRewards.filter((reward) =>
          votesIdsFormatted?.includes(Number(reward.venft_id)),
        )
      : votingRewards;

    if (!selectedRewards || !selectedRewards.length) {
      this.logger.error(
        `[CLAIM VOTING REWARDS: ${idForLogs}]: Invalid arguments, votesIds: ${votesIds}`,
      );

      throw new Error(
        'AI error occurred. Sometimes it happens. Please try again.',
      );
    }

    const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    if (!tokensInfoList) {
      this.logger.error(
        `[CLAIM VOTING REWARDS: ${idForLogs}]: NO tokens in cache`,
      );
      throw new Error('Tokens info not found');
    }

    const groupedRewards = selectedRewards.reduce((acc, reward) => {
      const key = `${Number(reward.venft_id)}${reward.pool.symbol}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(reward);
      return acc;
    }, {} as Record<number, IVotingReward[]>);

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      for (const voteRewards of Object.values(groupedRewards)) {
        const bribes: Record<Address, Address[]> = {};
        const revardTokensInfo: {
          type: string;
          amount: string;
          symbol: string;
          amountUsd: string;
        }[] = [];
        const veNFTTokenId = voteRewards[0].venft_id;
        const poolSymbol = voteRewards[0].pool.symbol;
        let feeBnTotal = BigInt(0);

        for (const reward of voteRewards) {
          const rbibesAndFees = [reward.bribe, reward.fee];
          const bribeAddress = rbibesAndFees.find(
            (address) => address !== zeroAddress,
          );

          if (!bribeAddress) {
            this.logger.error(
              `[CLAIM VOTING REWARDS: ${idForLogs}]: broken reward: ${reward}`,
            );
            throw new Error(`Broken reward: ${reward}`);
          }

          const rewardToken = tokensInfoList?.find(
            (t) => t.token_address.toUpperCase() === reward.token.toUpperCase(),
          );
          this.logger.log('rewardToken:', rewardToken);

          if (!rewardToken) {
            this.logger.error(
              `[CLAIM VOTING REWARDS: ${idForLogs}]: Token address: ${reward.token} not found`,
            );

            throw new Error(`Token address: ${reward.token} not found`);
          }

          if (!bribes[bribeAddress]) {
            bribes[bribeAddress] = [];
          }
          bribes[bribeAddress].push(reward.token);

          const amount = formatUnits(
            reward.amount || BigInt(0),
            reward.token_decimals || 18,
          );
          const amountUsd = (+amount * +(rewardToken?.price || 0)).toFixed(2);

          const { feeBn, fee } = this.aerodromeService.calculateFee(
            +amount,
            Number(rewardToken.price || '0'),
            ethPrice,
            yamlConfig.FEE_DETAILS.FEE_PCT,
            MAP_CHAIN_ID_CHAIN[chainId].nativeCurrency.decimals,
          );

          feeBnTotal += feeBn;

          if (fee <= 0) {
            this.logger.error(`
              [CLAIM VOTING REWARDS: ${idForLogs}]: fee calc crush => fee :${fee} ,feeBn: ${feeBn} 
              `);

            throw new Error(
              'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
            );
          }

          const isFeeReward = reward.fee !== zeroAddress;

          revardTokensInfo.push({
            type: isFeeReward ? 'Rewards' : 'Incentives',
            amount,
            symbol: rewardToken.symbol,
            amountUsd,
          });
        }

        const gasPrice = await viemClient.getGasPrice();
        const gasBn = BigInt(300000) * gasPrice;
        const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));
        const gasUSD = formatNumber(gasUsdWithoutFormatting, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        });
        const gasFormatted = formatEther(gasBn);

        if (isSimulation) {
          successMessages.push({
            isSimulation,
            venftId: Number(veNFTTokenId),
            gasBn,
            gasFormatted,
            gasUSD: Number(gasUSD).toFixed(2),
            success: true,
            poolSymbol,
            revardTokensInfo,
            chainId,
          });
          continue;
        }

        if (feeBnTotal === BigInt(0)) {
          errorMessages.push({
            success: false,
            isSimulation,
            votesIds,
            message: 'Claim voting rewards amount is too small.',
          });
          continue;
        }

        const claimVoteRewardData: IClaimVotingReward = {
          bribes: Object.keys(bribes) as Address[],
          rewardTokens: Object.values(bribes),
          veNFTTokenId,
          walletAddress: walletAddress as Address,
          feeBn: feeBnTotal,
        };

        const shouldExecuteWithoutConfirmation =
          user.should_execute_actions_without_confirmation;

        if (
          (isExternalChat && !isSimulation) ||
          (isExternalChat && shouldExecuteWithoutConfirmation)
        ) {
          const transactionResult = await this.privyClaimVotingRewards(
            claimVoteRewardData,
            chainId,
          );

          successMessages.push({
            ...transactionResult,
            venftId: Number(veNFTTokenId),
          });
          continue;
        }

        successMessages.push({
          success: true,
          action: 'claimVotingRewards',
          isSimulation,
          venftId: Number(veNFTTokenId),
          ...claimVoteRewardData,
          chainId,
        });
      }
    } catch (err) {
      this.logger.error(
        `[CLAIM VOTING REWARDS: ${idForLogs}]: ${err.message}`,
        err.stack,
      );

      errorMessages.push({
        success: false,
        isSimulation,
        votesIds,
        message: err.message,
      });
    }

    if (!isSimulation) {
      const cacheKey = getVotingRewardsKey(walletAddress, chainId);
      this.cacheService.del(cacheKey);
    }

    return [...successMessages, ...errorMessages];
  }

  private async privyClaimVotingRewards(
    lockData: IClaimVotingReward,
    chainId: number,
  ) {
    this.logger.log('RUN CLAIM VOTING REWARDS ON PRIVY', { lockData });
    const { walletAddress, bribes, rewardTokens, veNFTTokenId, feeBn } =
      lockData;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    await this.approveNft({
      chainId,
      nfpm: votingEscrow,
      tokenId: veNFTTokenId,
      walletAddress,
      spender: yamlConfig.SWAPPER_CONTRACTS[chainId],
    });

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'claimBribes',
      args: [bribes, rewardTokens, veNFTTokenId, feeBn],
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

    return { ...receipt, success: true, isSimulation: false } as const;
  }

  private async privyVote(
    chainId: number,
    address: Address,
    tokenId: bigint,
    addresses: Address[],
    powers: bigint[],
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { voter } = chainsConfig[chainId];

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: voter,
      abi: voterAbi,
      functionName: 'vote',
      args: [tokenId, addresses, powers],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: undefined,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async approveNft({
    chainId,
    nfpm,
    tokenId,
    walletAddress,
    spender,
  }: {
    chainId: number;
    nfpm: Address;
    tokenId: bigint;
    walletAddress: Address;
    spender: Address;
  }) {
    const viemClient = this.viemService.getViemClient(chainId);
    this.logger.log(`APPROVE START: ${nfpm} `);
    this.logger.log({
      address: nfpm,
      functionName: 'approve',
      args: [spender, tokenId],
      chainId,
      account: walletAddress,
    });
    await this.privyService.approve({
      viemClient,
      address: nfpm,
      abi: erc721Abi,
      functionName: 'approve',
      args: [spender, tokenId],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      account: walletAddress,
    });

    this.logger.log(`APPROVED: ${nfpm} `);
  }
}
