import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/server-auth';
import { subDays } from 'date-fns';
import Decimal from 'decimal.js';
import {
  Address,
  erc20Abi,
  formatUnits,
  getContract,
  GetContractReturnType,
  MulticallParameters,
  parseUnits,
  PublicClient,
  zeroAddress,
} from 'viem';
import { IPrivyAuthConfig } from '../../../../common/configs/privy-auth.config';
import { CacheService } from '../cache/cache.service';
import {
  getAllPoolsDataKey,
  getPoolsDataKey,
  getPositionsKey,
  getTokenInfoKey,
  getVotingRewardsKey,
} from '../cache/constants/keys';
import { UserEntity } from '../users/entities/user.entity';
import { factoryRegistryAbi } from '../../../../common/constants/chains/abis/factory-registry.abi';
import { factoryAbi } from '../../../../common/constants/chains/abis/factory.abi';
import { rewardsSugarAbi } from '../../../../common/constants/chains/abis/rewards-sugar.abi';
import { sugarAbi } from '../../../../common/constants/chains/abis/sugar.abi';
import { veSugarAbi } from '../../../../common/constants/chains/abis/ve-sugar.abi';
import { IToken } from '../../../../common/types/token';
import { ViemService } from '../viem/viem.service';
import { chainsConfig } from '../../../../common/constants/chains';
import { PositionsSummaryResponseDto } from '../../../../common/dtos/positions-summary-response.dto';
import { OPTIMISM_ID } from '../../../../common/constants/chains/optimism';
import {
  ActionType,
  LockFilters,
  LockOperations,
} from '../openai/tools-description/types';
import {
  ILock,
  IPosition,
  IVotingReward,
  PoolData,
  TLock,
  TokenResponse,
} from '../../../../common/types';
import { MINUTE, SECOND } from '../../../../common/constants/time';
import { yamlConfig } from 'src/common/configs/yaml.config';
import { TokensService } from '../tokens/tokens.service';
import { VelodromeStatisticsService } from './velodrome-statistics.service';
import { floorToFixed } from 'src/common/utils/floorToFixed';

@Injectable()
export class VelodromeService {
  readonly client: PrivyClient;
  private readonly logger = new Logger(VelodromeService.name);
  private readonly privyAuthConfig: IPrivyAuthConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
    private readonly tokensService: TokensService,
    private readonly velodromeStatisticsService: VelodromeStatisticsService,
  ) {
    this.privyAuthConfig =
      this.configService.getOrThrow<IPrivyAuthConfig>('privy_auth');

    this.client = new PrivyClient(
      this.privyAuthConfig.appId,
      this.privyAuthConfig.appSecret,
      {
        walletApi: {
          authorizationPrivateKey: process.env.PRIVY_WALLET_API_KEY,
        },
      },
    );
  }

  async getPoolsForVoting(chainId: number) {
    let pools = (await this.cacheService.get<PoolData[]>(
      getPoolsDataKey(chainId),
    )) as PoolData[];

    const totalVotes = pools.reduce(
      (sum, pool) => sum + Number(pool.votes || 0),
      0,
    );

    pools = pools?.filter((pool) => {
      if (
        new Decimal(pool.volume ?? 0).greaterThan(0) &&
        new Decimal(pool.tvl ?? 0).greaterThan(0) &&
        new Decimal(pool.apr ?? 0).greaterThan(0) &&
        new Decimal(pool.dailyEmissionUsd ?? 0).greaterThan(0)
      ) {
        return true;
      }
    });

    pools = pools
      .filter((pool) => pool.gauge_alive)
      .sort((a, b) => {
        const emissionsA = new Decimal(a.dailyEmissionUsd ?? 0);
        const emissionsB = new Decimal(b.dailyEmissionUsd ?? 0);
        return emissionsB.comparedTo(emissionsA);
      })
      .slice(0, 10);

    return pools.map((pool) => ({
      ...pool,
      tvl: pool.tvl,
      apr: pool.apr,
      vApr: pool.vApr,
      dailyEmissionUsd: pool.dailyEmissionUsd,
      volume: pool.volume,
      reserveInUsd0: pool.reserveInUsd0,
      reserveInUsd1: pool.reserveInUsd1,
      stakedInUsd0: pool.stakedInUsd0,
      stakedInUsd1: pool.stakedInUsd1,
      votes: pool.votes,
      votesPercent:
        totalVotes > 0 ? (Number(pool.votes || 0) / totalVotes) * 100 : 0,
    }));
  }

  async getLiquidityPositions(
    chainId: number,
    walletAddress: string,
    type: 'liquidity' | 'staked' | 'unstaked' | null,
    formatResults = true,
    forceUpdate = false,
    isThrowError = true,
    blockNumber?: bigint,
  ) {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const { sugarContract } = chainsConfig[chainId];

      const cacheKey = getPositionsKey(walletAddress, blockNumber, chainId);
      const cachedPositions = await this.cacheService.get<IPosition[]>(
        cacheKey,
      );

      if (cachedPositions && !forceUpdate) {
        return formatResults
          ? { type, positions: this.formatPositions(cachedPositions, type) }
          : cachedPositions;
      }

      const [tokens, pools, factories] = await Promise.all([
        this.cacheService.get<TokenResponse[]>(getTokenInfoKey(chainId)),
        this.cacheService.get<PoolData[]>(getAllPoolsDataKey(chainId)),
        this.getFactories(chainId),
      ]);

      const sugarContractInstance = getContract({
        address: sugarContract,
        abi: sugarAbi,
        client: viemClient,
      });
      let limit = BigInt(200);

      try {
        limit = BigInt(
          (await sugarContractInstance.read.MAX_POSITIONS()) || 200,
        );
      } catch {}

      type MulticallItem = {
        type: 'factory' | 'unstaked';
        call: MulticallParameters['contracts'][0];
      };
      const multicallQueue: MulticallItem[] = [];

      const factoryPoolLengths = await Promise.all(
        factories.map(async (factory) => {
          const factoryContract = getContract({
            address: factory,
            abi: factoryAbi,
            client: viemClient,
          });
          const poolsLength = await factoryContract.read.allPoolsLength({
            blockNumber,
          });
          return { factory, poolsLength };
        }),
      );
      for (const { factory, poolsLength } of factoryPoolLengths) {
        let offset = BigInt(0);
        while (offset < poolsLength) {
          multicallQueue.push({
            type: 'factory',
            call: {
              address: sugarContract,
              abi: sugarAbi,
              functionName: 'positionsByFactory',
              args: [limit, offset, walletAddress as Address, factory],
            },
          });
          offset += limit;
        }
      }

      let unstakedOffset = BigInt(0);
      while (unstakedOffset < BigInt(10000)) {
        multicallQueue.push({
          type: 'unstaked',
          call: {
            address: sugarContract,
            abi: sugarAbi,
            functionName: 'positionsUnstakedConcentrated',
            args: [limit, unstakedOffset, walletAddress as Address],
          },
        });
        unstakedOffset += limit;
      }

      const factoryResults: IPosition[] = [];
      const unstakedResults: IPosition[] = [];

      const multicallResults = await viemClient.multicall({
        contracts: multicallQueue.map((item) => item.call),
        blockNumber,
      });

      for (let i = 0; i < multicallResults.length; i++) {
        const result = multicallResults[i].result as any[];
        if (result?.length) {
          if (multicallQueue[i].type === 'factory') {
            factoryResults.push(...(result as IPosition[]));
          } else if (multicallQueue[i].type === 'unstaked') {
            unstakedResults.push(...(result as IPosition[]));
          }
        }
      }

      const [formattedFactoryPositions, formattedUnstakedPositions] =
        await Promise.all([
          this.formatPositionChunk(
            chainId,
            pools || [],
            tokens || [],
            factoryResults,
            walletAddress,
          ),
          this.formatPositionChunk(
            chainId,
            pools || [],
            tokens || [],
            unstakedResults,
            walletAddress,
          ),
        ]);

      const allPositions = [
        ...formattedFactoryPositions,
        ...formattedUnstakedPositions,
      ];

      if (allPositions?.length) {
        await this.cacheService.set(cacheKey, allPositions, 5 * MINUTE);
      }

      return formatResults
        ? { type, positions: this.formatPositions(allPositions, type) }
        : allPositions;
    } catch (error) {
      this.logger.error(
        `Cannot get liquidity positions by wallet address ${walletAddress}: ${JSON.stringify(
          error.message,
        )}`,
      );
      if (isThrowError) {
        throw new HttpException(
          'Cannot get liquidity positions by wallet address',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async getExtendedLocksByAddress(
    chainId: number,
    address: Address,
    type: LockOperations,
    filterLocks: LockFilters,
  ) {
    const locks = await this.getLocksByAddress(chainId, address);
    const tokenList = await this.cacheService.get<IToken[]>(
      getTokenInfoKey(chainId),
    );
    const velo_info = tokenList?.find((token) => token.symbol === 'VELO');
    if (
      !locks ||
      !locks.length ||
      !tokenList ||
      !tokenList.length ||
      !velo_info
    ) {
      throw new Error('Please try again later');
    }

    const poolList =
      (await this.cacheService.get<PoolData[]>(getPoolsDataKey(chainId))) || [];
    const poolMap = new Map<string, PoolData>(
      poolList.map((pool) => [pool.lp.toLowerCase(), pool]),
    );

    let extendedLocks: ILock[] = locks.map((lock) => ({
      ...lock,
      token_symbol: velo_info.symbol,
      votes: lock.votes.map((vote) => ({ ...vote })),
    }));

    const isExp = (timestamp) => Math.floor(Date.now() / SECOND) >= timestamp;

    if (filterLocks.includes(LockFilters.WithoutVotes)) {
      extendedLocks = extendedLocks.filter(
        (lock) => !lock.votes.length && !isExp(lock.expires_at),
      );
    }

    if (filterLocks.includes(LockFilters.Expired)) {
      extendedLocks = extendedLocks.filter(
        (lock) => !lock.permanent && isExp(lock.expires_at),
      );
    }

    if (filterLocks.includes(LockFilters.Active)) {
      extendedLocks = extendedLocks.filter(
        (lock) => lock.permanent || !isExp(lock.expires_at),
      );
    }

    const isInRelay = (managed_id) => Number(managed_id) !== 0;

    let message: string | undefined;

    switch (type) {
      case LockOperations.ResetLock:
        const { epochStartedAt } =
          await this.velodromeStatisticsService.getCurrentVotingRound(chainId);

        if (!epochStartedAt) throw new Error('Can not find epoch info');

        extendedLocks = extendedLocks.filter(
          (lock) =>
            lock.voted_at !== BigInt(0) &&
            BigInt(epochStartedAt) > lock.voted_at,
        );
        break;

      case LockOperations.Withdraw:
        extendedLocks = extendedLocks.filter(
          (lock) =>
            isExp(lock.expires_at) &&
            !lock.permanent &&
            !isInRelay(lock.managed_id) &&
            !lock.votes.length,
        );
        break;
      case LockOperations.Increase:
        extendedLocks = extendedLocks.filter(
          (lock) => !isInRelay(lock.managed_id) && !isExp(lock.expires_at),
        );
        break;
      case LockOperations.Merge:
        extendedLocks = extendedLocks.filter(
          (lock) =>
            !isInRelay(lock.managed_id) &&
            !(isExp(lock.expires_at) && !lock.permanent),
        );
        if (
          extendedLocks.length > 0 &&
          extendedLocks.every((lock) => lock.votes.length > 0)
        ) {
          extendedLocks = [];
          message =
            'All your locks has active votes. You need to create new one or rebase existing.';
        }
        break;
      case LockOperations.Extend:
        extendedLocks = extendedLocks.filter(
          (lock) =>
            !isInRelay(lock.managed_id) &&
            !isExp(lock.expires_at) &&
            !lock.permanent,
        );
        break;
      case LockOperations.Transfer:
        extendedLocks = extendedLocks.filter((lock) => {
          return !isInRelay(lock.managed_id);
        });
        break;
      case LockOperations.ClaimLockRewards:
        const veloPrice = Number(velo_info.price) || 0;
        extendedLocks = extendedLocks.filter((lock) => {
          const lockRewards = +formatUnits(
            lock.rebase_amount,
            velo_info.decimals,
          );
          const usdAmount = lockRewards * veloPrice;
          return (
            lock.rebase_amount > BigInt(0) &&
            usdAmount > 0.0000001 &&
            !isInRelay(lock.managed_id)
          );
        });
        break;

      case LockOperations.SetToRelay:
        extendedLocks = extendedLocks.filter(
          (lock) => !isInRelay(lock.managed_id) && lock.votes.length > 0,
        );
        break;
      case LockOperations.Poke:
        extendedLocks = extendedLocks.filter(
          (lock) =>
            !isInRelay(lock.managed_id) &&
            lock.votes.length > 0 &&
            (lock.permanent || !isExp(lock.expires_at)),
        );
        break;
      default:
        this.logger.log(`Unhandled lock operation: ${type}`);
        break;
    }

    extendedLocks = extendedLocks.map((lock) => ({
      ...lock,
      votes: lock.votes.map((vote) => {
        const pool = poolMap.get(vote.lp.toLowerCase());
        return {
          ...vote,
          pool_symbol: pool?.symbol,
        };
      }),
    }));

    return { locks: extendedLocks, type, chainId, message };
  }

  async getLocksByAddress(chainId: number, address: Address): Promise<TLock[]> {
    const viemClient = this.viemService.getViemClient(chainId);

    const { veSugar } = chainsConfig[chainId];

    const contract = getContract({
      address: veSugar,
      abi: veSugarAbi,
      client: viemClient,
    });

    const locks = await contract.read.byAccount([address]);
    const filteredLocks = locks?.filter((lock) => Number(lock.amount) !== 0);
    return (filteredLocks || []) as TLock[];
  }

  async getVotingRewards(chainId: number, address: Address) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { rewardsSugar } = chainsConfig[chainId];

    const cacheKey = getVotingRewardsKey(address, chainId);
    const cachedVotingRewards = await this.cacheService.get<IVotingReward[]>(
      cacheKey,
    );
    if (cachedVotingRewards) {
      return cachedVotingRewards;
    }

    const pools = await this.cacheService.get<PoolData[]>(
      getPoolsDataKey(chainId),
    );
    const tokens = await this.cacheService.get<IToken[]>(
      getTokenInfoKey(chainId),
    );

    const locks = await this.getLocksByAddress(OPTIMISM_ID, address);

    if (!pools || !locks) {
      return [];
    }

    const contract = getContract({
      address: rewardsSugar,
      abi: rewardsSugarAbi,
      client: viemClient,
    });

    const limit = BigInt(1000);
    const allRewardsData: IVotingReward[] = [];

    for (let i = 0; i < locks.length; i++) {
      const lock = locks[i];
      let offset = BigInt(0);

      for (let j = 0; j < 10; j++) {
        const rewardsChunk = (await contract.read.rewards([
          limit,
          offset,
          lock.id,
        ])) as IVotingReward[];

        for (let k = 0; k < rewardsChunk.length; k++) {
          const reward = rewardsChunk[k];

          const pool = pools.find((pool) => pool.lp === reward.lp);
          const rewardToken = tokens?.find(
            (token) =>
              token.token_address.toLowerCase() === reward.token.toLowerCase(),
          );

          if (!pool || !rewardToken) {
            continue;
          }

          rewardsChunk[k] = {
            ...reward,
            pool: {
              symbol: pool.symbol,
              lp: pool.lp,
              type: pool.type,
            },
            token_symbol: rewardToken.symbol,
            token_decimals: rewardToken.decimals,
            token0_symbol: pool.token0Symbol,
            token1_symbol: pool.token1Symbol,
          };
        }

        allRewardsData.push(...rewardsChunk);
        offset += BigInt(limit);
      }
    }

    await this.cacheService.set(cacheKey, allRewardsData, 5 * MINUTE);

    return allRewardsData;
  }

  async getWalletRewards(
    chainId: number,
    walletAddress: Address,
    isThrowError = true,
    blockNumber?: bigint,
  ) {
    const positions = (await this.getLiquidityPositions(
      chainId,
      walletAddress,
      null,
      false,
      false,
      isThrowError,
      blockNumber,
    )) as IPosition[];
    const tokens = await this.cacheService.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    if (!positions || !Array.isArray(positions) || !tokens) {
      return [];
    }

    const liquidityRewards = positions.map((position) => {
      const emissionsEarned = formatUnits(
        position.emissions_earned || BigInt(0),
        position.emissionsTokenDecimals || 18,
      );
      const token0FeesEarned = formatUnits(
        position.unstaked_earned0 || BigInt(0),
        position.token0Decimals || 18,
      );
      const token1FeesEarned = formatUnits(
        position.unstaked_earned1 || BigInt(0),
        position.token1Decimals || 18,
      );

      const token0 = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() ===
          position.token0Address?.toLowerCase(),
      );
      const token1 = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() ===
          position.token1Address?.toLowerCase(),
      );
      const emissionsToken = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() ===
          position.emissionsTokenAddress?.toLowerCase(),
      );

      return {
        positionId: position.id,
        symbol: position.symbol,
        emissionsEarned,
        emissionsEarnedUSD: floorToFixed(
          +emissionsEarned * +(emissionsToken?.price || 0),
        ),
        emissionsToken: position.emissionsTokenSymbol,
        token0FeesEarned,
        token0FeesEarnedUSD: floorToFixed(
          +token0FeesEarned * +(token0?.price || 0),
        ),
        token0: position.token0Symbol,
        token1FeesEarned,
        token1: position.token1Symbol,
        token1FeesEarnedUSD: floorToFixed(
          +token1FeesEarned * +(token1?.price || 0),
        ),
      };
    });

    const votingRewardsData = await this.getVotingRewards(
      chainId,
      walletAddress,
    );

    const votingRewards = votingRewardsData.map((reward) => {
      const amount = formatUnits(
        reward.amount || BigInt(0),
        reward.token_decimals || 18,
      );
      const token = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() === reward.token?.toLowerCase(),
      );

      const isFeeReward = reward.fee !== zeroAddress;

      return {
        venftId: reward.venft_id,
        tokenSymbol: reward.token_symbol,
        amount: amount,
        amountUSD: (+amount * +(token?.price || 0)).toFixed(2),
        type: isFeeReward ? 'Rewards' : 'Incentives',
        pool: reward.pool,
      };
    });

    return {
      liquidityRewards: liquidityRewards.length ? liquidityRewards : null,
      votingRewards: votingRewards.length ? votingRewards : null,
    };
  }

  async getFactories(chainId: number) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { factoryRegistry } = chainsConfig[chainId];

    const factoryRegistryInstance = getContract({
      address: factoryRegistry,
      abi: factoryRegistryAbi,
      client: viemClient,
    });

    return await factoryRegistryInstance.read.poolFactories();
  }

  async getPositionsSummary(
    chainId: number,
    walletAddress: Address,
  ): Promise<PositionsSummaryResponseDto> {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const latestBlock = await viemClient.getBlock();
      const latestTimestamp = Number(latestBlock.timestamp);
      const targetDate = subDays(new Date(latestTimestamp * 1000), 1);
      targetDate.setMinutes(0, 0, 0);
      const targetTimestamp = targetDate.getTime() / 1000;
      const block24hAgo = await this.getBlockNumberForTimestamp(
        chainId,
        targetTimestamp,
      );

      const [
        currentPositions,
        positions24hAgo,
        currentWalletRewards,
        rewards24hAgo,
      ] = await Promise.all([
        this.getLiquidityPositions(
          chainId,
          walletAddress,
          null,
          false,
          false,
          false,
        ) as Promise<IPosition[]>,
        this.getLiquidityPositions(
          chainId,
          walletAddress,
          null,
          false,
          false,
          false,
          block24hAgo,
        ) as Promise<IPosition[]>,
        this.getWalletRewards(chainId, walletAddress, false),
        this.getWalletRewards(chainId, walletAddress, false, block24hAgo),
      ]);

      const {
        availableToClaimUsd: availableToClaimUsdCurrent,
        tradingFeeUsd: tradingFeeUsdCurrent,
        voteRewardUsd: voteRewardUsdCurrent,
      } = this.calculateWalletRewards(currentWalletRewards);

      const [staked, unstaked] = this.calculateTotalDeposited(currentPositions);
      const totalDepositedCurrent = staked + unstaked;

      const {
        availableToClaimUsd: availableToClaimUsd24hAgo,
        tradingFeeUsd: tradingFeeUsd24hAgo,
        voteRewardUsd: voteRewardUsd24hAgo,
      } = this.calculateWalletRewards(rewards24hAgo);

      const [staked24hAgo, unstaked24hAgo] =
        this.calculateTotalDeposited(positions24hAgo);
      const totalDeposited24hAgo = staked24hAgo + unstaked24hAgo;

      return {
        staked,
        unstaked,
        totalDepositedCurrent,
        totalDeposited24hAgo,
        stakedReward: availableToClaimUsdCurrent,
        tradingFee: tradingFeeUsdCurrent,
        votingReward: voteRewardUsdCurrent,
        profits:
          availableToClaimUsdCurrent +
          tradingFeeUsdCurrent +
          voteRewardUsdCurrent,
        profits24hAgo:
          availableToClaimUsd24hAgo + tradingFeeUsd24hAgo + voteRewardUsd24hAgo,
      };
    } catch (error) {
      this.logger.error(`Cannot get positions summary: ${error.message}`);
      throw new HttpException(
        'Cannot get positions summary',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getExtraPoolData(chainId: number, pool: PoolData, address: string) {
    const viemClient = this.viemService.getViemClient(chainId);

    const calls = [
      { address: pool?.token0, functionName: 'symbol' },
      { address: pool?.token0, functionName: 'decimals' },
      { address: pool?.token1, functionName: 'symbol' },
      { address: pool?.token1, functionName: 'decimals' },
      { address: pool?.token0, functionName: 'balanceOf', args: [pool.lp] },
      { address: pool?.token1, functionName: 'balanceOf', args: [pool.lp] },
      { address: pool?.token0, functionName: 'balanceOf', args: [address] },
      { address: pool?.token1, functionName: 'balanceOf', args: [address] },
      { address: pool?.emissions_token, functionName: 'symbol' },
      { address: pool?.emissions_token, functionName: 'decimals' },
    ];

    return await viemClient.multicall({
      contracts: calls.map((call) => ({
        address: call.address as Address,
        abi: erc20Abi,
        functionName: call.functionName as any,
        args: call.args,
      })),
    });
  }

  async getTopTokens({
    chainId,
    filters = undefined,
    orderBy = 'volume_24h',
    sortOrder = 'desc',
    limit = 5,
  }: {
    chainId: number;
    filters: Partial<Record<keyof IToken, any>> | undefined;
    orderBy: 'volume_24h' | 'market_cap' | 'price' | null;
    sortOrder: 'asc' | 'desc';
    limit: number | undefined;
  }) {
    const velodromeTokens = await this.cacheService.get<IToken[]>(
      getTokenInfoKey(chainId),
    );

    if (!velodromeTokens?.length) {
      return [];
    }

    if (filters && (filters.listed === undefined || filters.listed === null)) {
      filters.listed = true;
    }

    if (!filters) {
      filters = { listed: true };
    }

    await Promise.allSettled(
      velodromeTokens.map(async (token, index) => {
        //!!tokens.listed - to avoid out of memory for long list of tokens
        if (token.listed && (!token.market_cap || !token.volume_24h)) {
          const tokenInfo = await this.tokensService.getTokenBySymbol(
            token.symbol,
            chainId,
          );

          if (tokenInfo?.marketCap)
            velodromeTokens[index]['market_cap'] = tokenInfo.marketCap;
          if (tokenInfo?.volume24h)
            velodromeTokens[index]['volume_24h'] = tokenInfo.volume24h;
        }
      }),
    );

    let filteredTokens =
      typeof filters === 'object'
        ? velodromeTokens.filter((token) => {
            return Object.entries(filters).every(
              ([key, value]: [
                keyof Partial<Record<keyof TokenResponse, any>>,
                number | boolean | string,
              ]) => {
                if (value === undefined || value === null) return true;
                if (key === 'token_address' && value === 1) {
                  return (
                    token.token_address.toLowerCase() ===
                    value.toString().toLowerCase()
                  );
                }
                if (key === 'symbol') {
                  return (
                    token.symbol.toUpperCase() ===
                    value.toString().toUpperCase()
                  );
                }
                if (key === 'listed' && value) {
                  return token.listed;
                }
                if (key === 'is_meme' && value) {
                  return token.is_meme;
                }

                if (key.startsWith('min_') || key.startsWith('max_')) {
                  if (key.startsWith('min_')) {
                    const actualKey = key.replace('min_', '') as keyof PoolData;
                    if (
                      token[actualKey] === undefined ||
                      token[actualKey] === null
                    ) {
                      return false;
                    }
                    return Number(token[actualKey] ?? 0) >= Number(value);
                  }
                  if (key.startsWith('max_')) {
                    const actualKey = key.replace('max_', '') as keyof PoolData;
                    if (
                      token[actualKey] === undefined ||
                      token[actualKey] === null
                    ) {
                      return false;
                    }
                    return Number(token[actualKey] ?? 0) <= Number(value);
                  }
                }

                return token[key] === value;
              },
            );
          })
        : velodromeTokens;

    if (orderBy && filteredTokens.length > 0) {
      filteredTokens = filteredTokens.sort((a, b) => {
        const aValue = a[orderBy];
        const bValue = b[orderBy];

        if (
          orderBy === 'market_cap' ||
          orderBy === 'volume_24h' ||
          orderBy === 'price'
        ) {
          return sortOrder === 'asc'
            ? (Number(aValue?.toString()) || 0) -
                (Number(bValue?.toString()) || 0)
            : (Number(bValue?.toString()) || 0) -
                (Number(aValue?.toString()) || 0);
        }

        if (aValue === undefined || bValue === undefined) return 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortOrder === 'asc' ? +aValue - +bValue : +bValue - +aValue;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortOrder === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        return 0;
      });
    }

    filteredTokens = filteredTokens.filter(
      (token) => Number(token.price || 0) > 0,
    );

    const excludedTokens = new Set(
      [
        '0x4200000000000000000000000000000000000006',
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      ].map((address) => address.toLowerCase()),
    );

    filteredTokens = filteredTokens.filter(
      (token) => !excludedTokens.has(token.token_address.toLowerCase()),
    );

    filteredTokens = filteredTokens.slice(0, Math.min(limit, 20));

    return filteredTokens;
  }

  async getPositionsByAddress(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    type: ActionType,
  ) {
    const MIN_REWARD_AMOUNT_USD = yamlConfig.FEE_DETAILS.MIN_REWARD_AMOUNT_USD;

    const IS_DISABLED_FOR_CLAIMING_REWARDS =
      yamlConfig.FEE_DETAILS.IS_DISABLED_FOR_CLAIMING_REWARDS;

    const address = user.wallets.find((wallet) => wallet.isDefault)
      ?.address as Address;

    if (!address) {
      throw new HttpException('Wallet not found', HttpStatus.BAD_REQUEST);
    }

    const response = await this.getLiquidityPositions(
      chainId,
      address,
      null,
      false,
    );

    let positions: IPosition[] = [];

    if (!response) {
      return { positions: [], type };
    }

    if (
      typeof response === 'object' &&
      'positions' in response &&
      Array.isArray(response.positions)
    ) {
      positions = response.positions as unknown as IPosition[];
    } else if (Array.isArray(response)) {
      positions = response;
    }

    let filteredPositions: IPosition[] = [];
    switch (type) {
      case ActionType.Stake:
        filteredPositions = positions.filter((position) => {
          return (
            position.alm === zeroAddress &&
            position.isActive &&
            (Number(position.amount0) > 0 || Number(position.amount1) > 0)
          );
        });
        break;
      case ActionType.Unstake:
        filteredPositions = positions.filter((position) => {
          return (
            position.alm === zeroAddress &&
            (position.staked0 > 0 || position.staked1 > 0)
          );
        });
        break;
      case ActionType.Withdraw:
        filteredPositions = positions.filter((position) => {
          return (
            position.alm === zeroAddress &&
            (Number(position.amount0) > 0 || Number(position.amount1) > 0)
          );
        });
        break;
      case ActionType.ClaimFee:
        filteredPositions = positions.filter((position) => {
          const isFeesEarned = IS_DISABLED_FOR_CLAIMING_REWARDS
            ? Number(position.token0FeesEarned || 0) >= 0 ||
              Number(position.token1FeesEarned || 0) >= 0
            : Number(position.token0FeesEarnedUSD || 0) >=
                MIN_REWARD_AMOUNT_USD ||
              Number(position.token1FeesEarnedUSD || 0) >=
                MIN_REWARD_AMOUNT_USD;

          if (position.isCl) {
            const isNotStaked = position.staked0 <= 0 && position.staked1 <= 0;

            return isNotStaked && isFeesEarned;
          }

          return isFeesEarned;
        });
        break;
      case ActionType.ClaimEmission:
        filteredPositions = positions.filter((position) => {
          const isEmissionEarned = IS_DISABLED_FOR_CLAIMING_REWARDS
            ? Number(position.emissionsEarned || 0) >= 0
            : Number(position.emissionsEarnedUSD || 0) >= MIN_REWARD_AMOUNT_USD;
          return isEmissionEarned;
        });
        break;
      case ActionType.ClaimAllRewards:
        filteredPositions = positions.filter((position) => {
          const isFeesEarned = IS_DISABLED_FOR_CLAIMING_REWARDS
            ? Number(position.token0FeesEarned || 0) >= 0 ||
              Number(position.token1FeesEarned || 0) >= 0
            : Number(position.token0FeesEarnedUSD || 0) >=
                MIN_REWARD_AMOUNT_USD ||
              Number(position.token1FeesEarnedUSD || 0) >=
                MIN_REWARD_AMOUNT_USD;

          const isEmissionEarned = IS_DISABLED_FOR_CLAIMING_REWARDS
            ? Number(position.emissionsEarned || 0) >= 0
            : Number(position.emissionsEarnedUSD || 0) >= MIN_REWARD_AMOUNT_USD;
          if (position.isCl) {
            const isNotStaked = position.staked0 <= 0 && position.staked1 <= 0;
            return (isNotStaked && isFeesEarned) || isEmissionEarned;
          }

          return isEmissionEarned || isFeesEarned;
        });
        break;
      default:
        filteredPositions = positions;
        break;
    }

    return { positions: filteredPositions, type };
  }

  calculateFee(
    amount: number,
    tokenPrice: number,
    ethPrice: number,
    feePct: number,
    decimals: number,
  ) {
    const tokenPriceInEth = tokenPrice / ethPrice;
    const fee = amount * (feePct / 100) * tokenPriceInEth;
    return { fee, feeBn: parseUnits(fee.toFixed(decimals), decimals) };
  }

  async estimateApprove(
    fromAddress: Address,
    tokenContract: GetContractReturnType<
      typeof erc20Abi,
      PublicClient,
      Address
    >,
    amountDesiredBN: bigint,
    spender: Address,
  ) {
    const allowance = await tokenContract?.read.allowance([
      fromAddress,
      spender,
    ]);

    if (allowance && allowance < amountDesiredBN) {
      await tokenContract?.estimateGas.approve([spender, amountDesiredBN], {
        account: fromAddress,
      });
    }
  }

  roundAmount(
    amount: bigint,
    multiplier: bigint,
    decimalsA = 18,
    decimalsB = 18,
    resultDecimals = 18,
  ): bigint {
    if (amount === BigInt(0) || multiplier === BigInt(0)) {
      return BigInt(0);
    }

    const scaledValue = amount * multiplier * BigInt(10 ** resultDecimals);

    const divisor = BigInt(10 ** (decimalsA + decimalsB));

    return scaledValue / divisor;
  }

  isCl(symbol: string): boolean {
    return !/^[sv]AMM-.*/.test(symbol);
  }

  getNativeTokenSymbol(chainId: number) {
    switch (chainId) {
      default:
        return 'ETH';
    }
  }

  private formatPositions(
    positions: IPosition[],
    type: 'liquidity' | 'staked' | 'unstaked' | null,
  ) {
    return positions
      .map((position) => {
        const [firstPair, secondToken] = (position.symbol as string).split('/');
        const [_, firstToken] = firstPair.split('-');

        const isCl = this.isCl(position.symbol || '');
        const isAlm = isCl && position.alm !== zeroAddress;

        if (
          (type === 'staked' &&
            position.staked0 <= BigInt(0) &&
            position.staked1 <= BigInt(0)) ||
          (type === 'unstaked' &&
            position.amount0 <= BigInt(0) &&
            position.amount1 <= BigInt(0))
        ) {
          return null;
        }

        return {
          id: position.id,
          symbol: position.symbol,
          token0: firstToken,
          token1: secondToken,
          staked0: formatUnits(position.staked0, position.token0Decimals || 18),
          staked1: formatUnits(position.staked1, position.token1Decimals || 18),
          unstaked0: formatUnits(
            position.amount0,
            position.token0Decimals || 18,
          ),
          unstaked1: formatUnits(
            position.amount1,
            position.token1Decimals || 18,
          ),
          emissionToken: position.emissionsToken,
          emissionsEarned: position.emissionsEarned,
          emissionsEarnedUSD: position.emissionsEarnedUSD,
          token0FeesEarned: position.token0FeesEarned,
          token1FeesEarned: position.token1FeesEarned,
          token0FeesEarnedUSD: position.token0FeesEarnedUSD,
          token1FeesEarnedUSD: position.token1FeesEarnedUSD,
          amount0USD: position.amount0USD,
          amount1USD: position.amount1USD,
          staked0USD: position.staked0USD,
          staked1USD: position.staked1USD,
          isCl,
          isAlm,
          isActive: position.isActive,
        };
      })
      .filter(Boolean);
  }

  private async formatPositionChunk(
    chainId: number,
    pools: PoolData[],
    tokens: TokenResponse[],
    positionsChunk: IPosition[],
    address: string,
  ) {
    const positionsChunkFormatted: IPosition[] = [];
    for (let i = 0; i < positionsChunk.length; i++) {
      const position = positionsChunk[i];
      const pool = pools.find(
        (pool) => pool.lp.toLowerCase() === position.lp.toLowerCase(),
      );

      if (!pool) {
        continue;
      }

      const token0 = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() === pool.token0?.toLowerCase(),
      );
      const token1 = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() === pool.token1?.toLowerCase(),
      );
      const emissionsToken = tokens.find(
        (token) =>
          token.token_address?.toLowerCase() ===
          pool.emissions_token?.toLowerCase(),
      );
      const emissionsEarned = formatUnits(
        position.emissions_earned || BigInt(0),
        emissionsToken?.decimals || 18,
      );
      const token0FeesEarned = formatUnits(
        position.unstaked_earned0 || BigInt(0),
        token0?.decimals || 18,
      );
      const token1FeesEarned = formatUnits(
        position.unstaked_earned1 || BigInt(0),
        token1?.decimals || 18,
      );

      const amount0USD =
        Number(formatUnits(position.amount0, token0?.decimals || 18)) *
        +(token0?.price || 0);
      const amount1USD =
        Number(formatUnits(position.amount1, token1?.decimals || 18)) *
        +(token1?.price || 0);
      const staked0USD =
        Number(formatUnits(position.staked0, token0?.decimals || 18)) *
        +(token0?.price || 0);
      const staked1USD =
        Number(formatUnits(position.staked1, token1?.decimals || 18)) *
        +(token1?.price || 0);

      const data = await this.getExtraPoolData(chainId, pool, address);

      positionsChunkFormatted.push({
        ...position,
        symbol: pool?.symbol
          ? pool.symbol
          : `CL${pool?.type}-${data[0].result}/${data[2].result}`,
        token0Address: pool?.token0,
        token1Address: pool?.token1,
        token0Symbol: data[0].result as string,
        token0Decimals: data[1].result as number,
        token1Symbol: data[2].result as string,
        token1Decimals: data[3].result as number,
        poolBalance0: data[4].result as bigint,
        poolBalance1: data[5].result as bigint,
        accountBalance0: data[6].result as bigint,
        accountBalance1: data[7].result as bigint,
        emissionsTokenAddress: pool?.emissions_token as Address,
        emissionsTokenSymbol: data[8].result as string,
        emissionsTokenDecimals: data[9].result as number,
        emissionsEarned,
        emissionsEarnedUSD: floorToFixed(
          +emissionsEarned * +(emissionsToken?.price || 0),
        ),
        emissionsToken: emissionsToken?.symbol,
        token0FeesEarned,
        token0FeesEarnedUSD: floorToFixed(
          +token0FeesEarned * +(token0?.price || 0),
        ),
        token0: token0?.symbol,
        token1FeesEarned,
        token1: token1?.symbol,
        token1FeesEarnedUSD: floorToFixed(
          +token1FeesEarned * +(token1?.price || 0),
        ),
        amount0USD: `${amount0USD}`,
        amount1USD: `${amount1USD}`,
        staked0USD: `${staked0USD}`,
        staked1USD: `${staked1USD}`,
        isActive: pool.gauge_alive,
        isCl: this.isCl(pool.symbol),
      });
    }
    return positionsChunkFormatted;
  }

  private async getBlockNumberForTimestamp(
    chainId: number,
    targetTimestamp: number,
  ): Promise<bigint> {
    const viemClient = this.viemService.getViemClient(chainId);

    const latestBlock = await viemClient.getBlock();
    const latestTimestamp = Number(latestBlock.timestamp);
    const latestBlockNumber = BigInt(latestBlock.number);
    const delta = latestTimestamp - targetTimestamp;
    const deltaBlocks = BigInt(
      Math.floor(delta / chainsConfig[chainId].blockTime),
    );
    return latestBlockNumber - deltaBlocks;
  }

  private calculateTotalDeposited(
    positions: IPosition[] | { type: string; positions: IPosition[] },
  ): [number, number] {
    let posArray: IPosition[];
    if (Array.isArray(positions)) {
      posArray = positions;
    } else if (positions && 'positions' in positions) {
      posArray = positions.positions;
    } else {
      return [0, 0];
    }
    const staked = posArray.reduce(
      (sum, pos) =>
        sum +
        parseFloat(pos.staked0USD || '0') +
        parseFloat(pos.staked1USD || '0'),
      0,
    );
    const unstaked = posArray.reduce(
      (sum, pos) =>
        sum +
        parseFloat(pos.amount0USD || '0') +
        parseFloat(pos.amount1USD || '0'),
      0,
    );

    return [staked, unstaked];
  }

  private calculateWalletRewards(walletRewards: any): {
    availableToClaimUsd: number;
    tradingFeeUsd: number;
    voteRewardUsd: number;
  } {
    let availableToClaimUsd = 0;
    let tradingFeeUsd = 0;
    let voteRewardUsd = 0;
    if (!Array.isArray(walletRewards) && walletRewards.liquidityRewards) {
      for (const reward of walletRewards.liquidityRewards) {
        availableToClaimUsd += +reward.emissionsEarnedUSD || 0;
        tradingFeeUsd +=
          (+reward.token0FeesEarnedUSD || 0) +
          (+reward.token1FeesEarnedUSD || 0);
      }
    }
    if (!Array.isArray(walletRewards) && walletRewards.votingRewards) {
      voteRewardUsd = walletRewards.votingRewards.reduce(
        (sum, reward) => sum + (parseFloat(reward.amountUSD) || 0),
        0,
      );
    }
    return { availableToClaimUsd, tradingFeeUsd, voteRewardUsd };
  }
}
