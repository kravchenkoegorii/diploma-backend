import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  EpochData,
  IPoolsFilter,
  IRebaseAprData,
  PoolData,
  TokenResponse,
  TPoolReward,
} from 'src/common/types';
import { parseBigIntToString } from 'src/common/utils/parse-big-int-to-string';
import {
  Address,
  formatUnits,
  getContract,
  parseUnits,
  zeroAddress,
} from 'viem';
import { DAY, HOUR } from '../../../../common/constants/time';
import { CacheService } from '../cache/cache.service';
import {
  getAllPoolsDataKey,
  getEpochsLatestKey,
  getPoolsDataKey,
  getRelaysKey,
  getTokenInfoKey,
} from '../cache/constants/keys';
import { minterAbi } from '../../../../common/constants/chains/abis/minter.abi';
import { sugarRelaysAbi } from '../../../../common/constants/chains/abis/sugar-relays.abi';
import { votingAbi } from '../../../../common/constants/chains/abis/voting.abi';
import { IRelay } from '../../../../common/types/relay';
import {
  divideWithPrecision,
  multiplyWithPrecision,
} from 'src/common/utils/bigint';
import { formatDuration, intervalToDuration } from 'date-fns';
import { ViemService } from '../viem/viem.service';
import { chainsConfig } from '../../../../common/constants/chains';
import { TokensService } from '../tokens/tokens.service';

@Injectable()
export class AerodromeStatisticsService {
  private readonly logger = new Logger(AerodromeStatisticsService.name);

  private readonly TVL_THRESHOLD = 500;
  private readonly TVV_THRESHOLD = 300;

  constructor(
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
    private readonly tokensService: TokensService,
  ) {
    this.getCurrentVotingRound = this.getCurrentVotingRound.bind(this);
    this.getTopRelaysData = this.getTopRelaysData.bind(this);
    this.findPoolsWithFilters = this.findPoolsWithFilters.bind(this);
    this.getStatistics = this.getStatistics.bind(this);
  }

  public async findPoolsWithFilters({
    chainId,
    filters = undefined,
    orderBy = null,
    sortOrder = 'desc',
    limit = 5,
  }: {
    chainId: number;
    filters: IPoolsFilter | undefined;
    orderBy: keyof PoolData | null;
    sortOrder: 'asc' | 'desc';
    limit: number | undefined;
  }): Promise<{ total: number; pools: PoolData[] }> {
    const pools = await this.cacheService.get<PoolData[]>(
      getPoolsDataKey(chainId),
    );

    if (!pools || pools.length === 0) {
      return {
        total: 0,
        pools: [],
      };
    }

    const Fuse = await require('fuse.js');
    const fuse = new Fuse(
      pools.map(
        (pool): PoolData => ({
          ...pool,
          symbol: pool.symbol?.toLowerCase(),
        }),
      ),
      {
        keys: ['symbol'],
        threshold: 0.1,
        ignoreLocation: true,
      },
    );
    let fuseResults;
    if (filters && filters?.symbol && limit === 1) {
      fuseResults = fuse.search(filters.symbol.toString().toLowerCase())?.[0];
    } else if (filters && filters?.symbol) {
      fuseResults = fuse.search(filters.symbol.toString().toLowerCase());
    }

    if (filters && filters.min_tvl === undefined) {
      filters.min_tvl = this.TVL_THRESHOLD;
    }

    const totalVotes = pools.reduce(
      (sum, pool) => sum + Number(pool.votes || 0),
      0,
    );

    let filteredPools =
      typeof filters === 'object'
        ? pools.filter((pool) => {
            return Object.entries(filters).every(
              ([key, value]: [
                keyof IPoolsFilter,
                number | boolean | string,
              ]) => {
                if (value === undefined || value === null) return true;
                if (key === 'type' && typeof value === 'string') {
                  const fullType = this.getFormattedPoolType(pool.type);
                  const [formattedType] = fullType.split(' ');
                  return value.toLowerCase() === formattedType.toLowerCase();
                }

                if (key === 'typeByStability' && typeof value === 'string') {
                  const fullType = this.getFormattedPoolType(pool.type);
                  const [_, stabilityType] = fullType.split(' ');
                  return value.toLowerCase() === stabilityType.toLowerCase();
                }
                if (
                  key === 'mostRewarded' &&
                  typeof value === 'boolean' &&
                  pool.totalRewardsInUSD
                ) {
                  return value
                    ? pool.totalRewardsInUSD > this.TVV_THRESHOLD
                    : pool.totalRewardsInUSD <= this.TVV_THRESHOLD;
                }
                if (key === 'token0') {
                  return (
                    pool.token0.toLowerCase() ===
                      value.toString().toLowerCase() ||
                    pool.token1.toLowerCase() === value.toString().toLowerCase()
                  );
                }
                if (key === 'token1') {
                  return (
                    pool.token1.toLowerCase() ===
                      value.toString().toLowerCase() ||
                    pool.token0.toLowerCase() === value.toString().toLowerCase()
                  );
                }
                if (key === 'symbol') {
                  if (limit === 1) {
                    return (
                      fuseResults.item.symbol.toLowerCase() ===
                      pool.symbol.toLowerCase()
                    );
                  } else {
                    return fuseResults?.some(
                      (res) =>
                        res.item.symbol.toLowerCase() ===
                        pool.symbol.toLowerCase(),
                    );
                  }
                }
                if (key.startsWith('min_') || key.startsWith('max_')) {
                  if (key.startsWith('min_')) {
                    const actualKey = key.replace('min_', '') as keyof PoolData;
                    return Number(pool[actualKey] ?? 0) >= Number(value);
                  }
                  if (key.startsWith('max_')) {
                    const actualKey = key.replace('max_', '') as keyof PoolData;
                    return Number(pool[actualKey] ?? 0) <= Number(value);
                  }
                }
                if (key.startsWith('isExotic')) {
                  return true;
                }
                if (typeof pool[key] === 'string') {
                  const useStartsWith = filters.useStartsWith || false;
                  if (useStartsWith) {
                    return pool[key]
                      .toLowerCase()
                      .startsWith(value.toString().toLowerCase());
                  }
                  return pool[key]
                    .toLowerCase()
                    .includes(value.toString().toLowerCase());
                }
                return pool[key] === value;
              },
            );
          })
        : pools;

    if (orderBy && filteredPools.length > 0) {
      filteredPools = filteredPools.sort((a, b) => {
        const aValue = a[orderBy];
        const bValue = b[orderBy];

        if (
          orderBy === 'liquidity' ||
          orderBy === 'tvl' ||
          orderBy === 'apr' ||
          orderBy === 'vApr' ||
          orderBy === 'volume' ||
          orderBy === 'reserve0' ||
          orderBy === 'reserve1' ||
          orderBy === 'staked0' ||
          orderBy === 'staked1' ||
          orderBy === 'pool_fee' ||
          orderBy === 'votes' ||
          orderBy === 'reserveInUsd0' ||
          orderBy === 'reserveInUsd1'
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

    if (filters?.isExotic) {
      const exoticPools = filteredPools.filter(
        (pool) =>
          !pool.symbol.includes('USDC/AERO') &&
          !pool.symbol.includes('WETH/USDC') &&
          !pool.symbol.toLowerCase().includes('btc'),
      );

      if (exoticPools.length <= 10) {
        filteredPools = exoticPools.slice(0, Math.min(limit, 20));
      } else if (exoticPools.length < 20) {
        filteredPools = exoticPools.slice(exoticPools.length - 10);
      } else {
        filteredPools = exoticPools.slice(10, 10 + Math.min(limit, 20));
      }
    } else {
      filteredPools = filteredPools.slice(0, Math.min(limit, 20));
    }

    filteredPools = filteredPools.map((pool) => ({
      ...pool,
      liquidity: formatUnits(
        BigInt(pool.liquidity),
        pool.decimals || 18,
      ).toString(),
      pool_fee: new Decimal(pool.pool_fee)
        .div(pool.type > 0 ? 10000 : 100)
        .toNumber(),
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

    return {
      total: pools.length,
      pools: filteredPools,
    };
  }

  public async getTopRelaysData(
    chainId: number,
    address: Address,
  ): Promise<IRelay[] | undefined> {
    const viemClient = this.viemService.getViemClient(chainId);

    try {
      const relaysData = await this.cacheService.get<IRelay[]>(
        getRelaysKey(chainId),
      );

      if (relaysData) {
        return relaysData.slice(0, 5);
      }

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        return [];
      }

      const { sugarRelays, votingEscrow } = chainsConfig[chainId];

      const sugarContract = getContract({
        address: sugarRelays,
        abi: sugarRelaysAbi,
        client: viemClient,
      });
      const votingEscrowContract = getContract({
        address: votingEscrow,
        abi: votingAbi,
        client: viemClient,
      });

      const votingTokenAddress = await votingEscrowContract.read.token();
      const votingToken = tokens.find(
        (token) =>
          token.token_address.toLowerCase() ===
          votingTokenAddress.toLowerCase(),
      );

      const limit = BigInt(150);
      let hasMoreData = true;
      let allRelaysData: IRelay[] = [];

      while (hasMoreData) {
        const relaysChunk = (await sugarContract.read.all([
          address,
        ])) as IRelay[];

        if (relaysChunk?.length === 0) {
          hasMoreData = false;
          break;
        }

        for (let i = 0; i < relaysChunk.length; i++) {
          const relay = relaysChunk[i];
          const token = tokens.find(
            (token) =>
              token.token_address.toLowerCase() === relay.token.toLowerCase(),
          );

          relay.chainId = chainId;

          relay.token_symbol = token?.symbol ?? '';
          relay.amount_formatted = formatUnits(
            relay.amount,
            relay.decimals || 18,
          );

          if (relay.used_voting_amount && relay.compounded) {
            const compoundedValue = multiplyWithPrecision(
              relay.compounded,
              parseUnits(token?.price || '1', token?.decimals || 18),
              token?.decimals || 18,
            );

            const weeklyAPR = multiplyWithPrecision(
              BigInt(52),
              compoundedValue,
              relay.decimals,
            );

            const usedVotingAmountValue = multiplyWithPrecision(
              relay.used_voting_amount,
              parseUnits(
                votingToken?.price || '1',
                votingToken?.decimals || 18,
              ),
              votingToken?.decimals || 18,
            );
            const apr = divideWithPrecision(
              weeklyAPR,
              usedVotingAmountValue,
              36,
            );
            const APPROX_CORRECTION = 8;

            relay.apr = +formatUnits(apr, relay.decimals) + APPROX_CORRECTION;
          } else {
            relay.apr = 0;
          }
        }

        allRelaysData.push(...relaysChunk);

        if (relaysChunk.length < limit) {
          hasMoreData = false;
        }
      }

      allRelaysData = allRelaysData.filter(
        (relay) => !relay.inactive && relay.name.includes('veAERO'),
      );

      allRelaysData.sort((a, b) => {
        return +b.voting_amount.toString() - +a.voting_amount.toString();
      });

      await this.cacheService.set(
        getRelaysKey(chainId),
        parseBigIntToString(allRelaysData),
        HOUR,
      );

      return allRelaysData.slice(0, 5);
    } catch (error) {
      this.logger.error('An error occurred', error);
    }
  }

  public async getCurrentVotingRound(chainId: number): Promise<EpochData> {
    const viemClient = this.viemService.getViemClient(chainId);
    const pools = await this.cacheService.get<PoolData[]>(
      getAllPoolsDataKey(chainId),
    );

    const tokens = await this.cacheService.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    const rewards = await this.cacheService.get<TPoolReward[]>(
      getEpochsLatestKey(chainId),
    );

    const { votingEscrow, minter } = chainsConfig[chainId];

    const response = await viemClient.multicall({
      contracts: [
        {
          address: votingEscrow,
          abi: votingAbi,
          functionName: 'totalSupply',
        },
        {
          address: minter,
          abi: minterAbi,
          functionName: 'activePeriod',
        },
        {
          address: minter,
          abi: minterAbi,
          functionName: 'weekly',
        },
        {
          address: minter,
          abi: minterAbi,
          functionName: 'epochCount',
        },
      ],
    });

    const totalSupply = response[0].result || BigInt(0);
    const activePeriod = +(response[1].result?.toString() || 0);
    const endsAt = new Date(activePeriod * 1000 + DAY * 7);
    const duration = intervalToDuration({
      start: new Date(),
      end: endsAt,
    });
    let endsIn = formatDuration(duration);
    if ((duration.days || 0) > 0 || (duration.hours || 0) > 0) {
      endsIn = formatDuration(duration, {
        format: ['years', 'months', 'days', 'hours'],
      });
    }
    const newEmissions = response[2].result || BigInt(0);
    const epochCount = +(response[3].result?.toString() || 0);

    let totalFees = 0;
    let totalIncentives = 0;

    for (let i = 0; i < (pools?.length ?? 0); i++) {
      const pool = pools?.[i];

      if (!pool) {
        continue;
      }

      const reward = rewards?.find(
        (reward) => reward.lp.toLowerCase() === pool.lp.toLowerCase(),
      );

      if (reward) {
        for (const fee of reward.fees) {
          const token = tokens?.find(
            (token) =>
              token.token_address.toLowerCase() === fee.token.toLowerCase(),
          );
          const token_amount = new Decimal(fee.amount.toString());
          const token_fee = token_amount
            .div(10 ** (token?.decimals || 18))
            .mul(token?.price || 0);
          totalFees = totalFees + token_fee.toNumber();
        }

        for (const bribe of reward.bribes) {
          const token = tokens?.find(
            (token) =>
              token.token_address.toLowerCase() === bribe.token.toLowerCase(),
          );
          const token_amount = new Decimal(bribe.amount.toString());
          const token_incentive_fee = token_amount
            .div(10 ** (token?.decimals || 18))
            .mul(token?.price || 0);
          totalIncentives = totalIncentives + token_incentive_fee.toNumber();
        }
      }
    }

    return {
      chainId,
      epochCount,
      totalSupply: formatUnits(totalSupply, 18),
      endsAt: endsAt.toISOString(),
      endInMs: endsIn,
      newEmissions: formatUnits(newEmissions, 18),
      totalFeesForPreviousEpoch: totalFees?.toString(),
      totalIncentivesForPreviousEpoch: totalIncentives?.toString(),
      totalRewardsForPreviousEpoch: totalFees + totalIncentives,
      epochStartedAt: response[1].result?.toString(),
    };
  }

  async getRebaseApr(chainId: number): Promise<IRebaseAprData> {
    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow, minter } = chainsConfig[chainId];

    const response = await viemClient.multicall({
      contracts: [
        {
          address: votingEscrow,
          abi: votingAbi,
          functionName: 'token',
        },
        {
          address: votingEscrow,
          abi: votingAbi,
          functionName: 'supply',
        },
        {
          address: votingEscrow,
          abi: votingAbi,
          functionName: 'decimals',
        },
        {
          address: minter,
          abi: minterAbi,
          functionName: 'weekly',
        },
      ],
    });
    const votingTokenAddress = response[0].result;
    const tokenSupply = response[1].result || BigInt(0);
    const decimals = +(response[2].result?.toString() || 18);
    const weekly = response[3].result || BigInt(0);

    const growth = await viemClient.readContract({
      address: minter,
      abi: minterAbi,
      functionName: 'calculateGrowth',
      args: [weekly],
    });

    const growthYearly = multiplyWithPrecision(
      growth,
      parseUnits('52', decimals),
      decimals,
    );

    const rebateApr = divideWithPrecision(growthYearly, tokenSupply, decimals);

    return {
      chainId,
      rebaseApr: formatUnits(rebateApr, decimals),
      votingTokenAddress,
      tokenSupply: formatUnits(tokenSupply, decimals),
      decimals,
      weeklyGrowth: formatUnits(weekly, decimals),
    };
  }

  async addMoreDataToPools(
    chainId: number,
    pools: PoolData[],
    rewards: TPoolReward[],
  ): Promise<PoolData[]> {
    const tokens = await this.cacheService.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    if (!tokens) {
      return pools;
    }

    const { rebaseApr, votingTokenAddress } = await this.getRebaseApr(chainId);

    const tokensMap = new Map<string, TokenResponse>();
    tokens.forEach((token) => {
      return tokensMap.set(token.token_address.toLowerCase(), token);
    });

    for (const pool of pools) {
      try {
        const reward = rewards.find(
          (reward) => reward.lp.toLowerCase() === pool.lp.toLowerCase(),
        );

        const token0 = tokensMap.get(pool.token0.toLowerCase());
        const token1 = tokensMap.get(pool.token1.toLowerCase());

        const reserveInTokens0Num = this.formatValue(
          pool.reserve0,
          token0?.decimals ?? 18,
        );
        const reserveInTokens1Num = this.formatValue(
          pool.reserve1,
          token1?.decimals ?? 18,
        );

        const stakedInTokens0Num = this.formatValue(
          pool.staked0,
          token0?.decimals ?? 18,
        );
        const stakedInTokens1Num = this.formatValue(
          pool.staked1,
          token1?.decimals ?? 18,
        );

        const price0 = new Decimal(token0?.price ?? 0);
        const price1 = new Decimal(token1?.price ?? 0);

        const reserveInUsd0Num = reserveInTokens0Num.mul(price0);
        const reserveInUsd1Num = reserveInTokens1Num.mul(price1);

        const stakedInUsd0Num = stakedInTokens0Num.mul(price0);
        const stakedInUsd1Num = stakedInTokens1Num.mul(price1);

        const tvl = reserveInUsd0Num.add(reserveInUsd1Num);

        const dailyEmissionUsdNum = await this.calculateDailyEmissionUsd(
          pool,
          tokensMap,
        );

        const apr = this.calculateApr(
          pool,
          tvl,
          dailyEmissionUsdNum,
          tokensMap,
        );

        const volume = this.calculateVolume(pool, token0, token1);

        pool.poolUrl = `https://basescan.org/address/${pool.lp}`;

        pool.symbol = !!pool?.symbol
          ? pool?.symbol
          : `CL${pool.type}-${token0?.symbol}/${token1?.symbol}`;

        pool.formattedType = this.getFormattedPoolType(pool.type);

        pool.token0Symbol = token0?.symbol;
        pool.token1Symbol = token1?.symbol;
        pool.reserveInUsd0 = reserveInUsd0Num.toString();
        pool.reserveInUsd1 = reserveInUsd1Num.toString();
        pool.stakedInUsd0 = stakedInUsd0Num.toString();
        pool.stakedInUsd1 = stakedInUsd1Num.toString();
        pool.tvl = tvl.toString();
        pool.apr = apr.toString();
        pool.volume = volume.toString();
        pool.dailyEmissionUsd = dailyEmissionUsdNum.toString();
        pool.rebateApr = rebaseApr;

        if (reward) {
          pool.fees = reward?.fees.map((fee) => {
            const token = tokensMap.get(fee.token.toLowerCase());
            return {
              token: fee.token,
              amount: formatUnits(fee.amount, token?.decimals || 18),
            };
          });
          pool.bribes = reward?.bribes.map((bribe) => {
            const token = tokensMap.get(bribe.token.toLowerCase());
            return {
              token: bribe.token,
              amount: formatUnits(bribe.amount, token?.decimals || 18),
            };
          });
          pool.votes = formatUnits(reward?.votes, pool.decimals || 18);
          if (votingTokenAddress) {
            pool.vApr = '0';

            const votingToken = tokensMap.get(votingTokenAddress.toLowerCase());

            let totalFees = 0;
            let totalIncentives = 0;
            for (const fee of reward.fees) {
              const token = tokens?.find(
                (token) =>
                  token.token_address.toLowerCase() === fee.token.toLowerCase(),
              );
              const token_amount = new Decimal(fee.amount.toString());
              const token_fee = token_amount
                .div(10 ** (token?.decimals || 18))
                .mul(token?.price || 0);
              totalFees = totalFees + token_fee.toNumber();
            }

            for (const bribe of reward.bribes) {
              const token = tokens?.find(
                (token) =>
                  token.token_address.toLowerCase() ===
                  bribe.token.toLowerCase(),
              );
              const token_amount = new Decimal(bribe.amount.toString());
              const token_incentive_fee = token_amount
                .div(10 ** (token?.decimals || 18))
                .mul(token?.price || 0);
              totalIncentives =
                totalIncentives + token_incentive_fee.toNumber();
            }

            pool.totalFeesInUSD = totalFees;
            pool.totalIncentivesInUSD = totalIncentives;
            pool.totalRewardsInUSD = totalFees + totalIncentives;
            const yearlyFees = (totalFees + totalIncentives) * 52;
            const votesInUsd = new Decimal(pool.votes).mul(
              +(votingToken?.price || 0),
            );
            if (votesInUsd.isZero()) {
              pool.vApr = '0';
            } else {
              pool.vApr = (
                (yearlyFees / votesInUsd.toNumber()) * 100 +
                +rebaseApr
              ).toString();
            }
          }
        }
      } catch (error) {
        this.logger.error(error);
      }
    }

    return pools;
  }

  async getStatistics(chainId: number) {
    const pools = await this.cacheService.get<PoolData[] | undefined>(
      getPoolsDataKey(chainId),
    );
    const tokens = await this.cacheService.get<TokenResponse[] | undefined>(
      getTokenInfoKey(chainId),
    );
    const relays = await this.cacheService.get<IRelay[] | undefined>(
      getRelaysKey(chainId),
    );

    let totalTvl = 0;
    let totalSwapFees = 0;
    let totalVolume = 0;

    for (const pool of pools || []) {
      const token0 = tokens?.find(
        (token) =>
          token.token_address.toLowerCase() === pool.token0.toLowerCase(),
      );
      const token1 = tokens?.find(
        (token) =>
          token.token_address.toLowerCase() === pool.token1.toLowerCase(),
      );

      totalTvl += +(pool.tvl || 0);
      totalSwapFees +=
        +formatUnits(BigInt(pool.token0_fees), token0?.decimals || 18) *
          +(token0?.price || 0) +
        +formatUnits(BigInt(pool.token1_fees), token1?.decimals || 18) *
          +(token1?.price || 0);
      totalVolume += +(pool.volume || 0);
    }

    const listedTokens = tokens?.filter((token) => token.listed);

    return {
      chainId,
      totalTvl,
      totalSwapFees,
      totalVolume,
      totalPools: pools?.length ?? 0,
      totalListedTokens: listedTokens?.length ?? 0,
      totalRelays: relays?.length ?? 0,
    };
  }

  private async calculateDailyEmissionUsd(
    pool: PoolData,
    tokens: Map<string, TokenResponse>,
  ): Promise<Decimal> {
    const rawEmissions = pool.emissions;

    let token = tokens.get(pool.emissions_token.toLowerCase()) as TokenResponse;

    if (pool.emissions_token.toLowerCase() === zeroAddress) {
      token = tokens.get(
        '0x4200000000000000000000000000000000000006',
      ) as TokenResponse;
    }

    const emissionsPrice = new Decimal(token?.price ?? 0);
    const emissionsPerSec = this.formatValue(
      rawEmissions,
      token?.decimals ?? 18,
    );

    const dailyEmissionsTokens = emissionsPerSec.mul(DAY / 1000);

    return dailyEmissionsTokens.mul(emissionsPrice);
  }

  private calculateApr(
    pool: PoolData,
    tvlNum: Decimal,
    dailyEmissionUsdNum: Decimal,
    tokens: Map<string, TokenResponse>,
  ): Decimal {
    const token0 = tokens.get(pool.token0.toLowerCase());
    const token1 = tokens.get(pool.token1.toLowerCase());

    if (!token0?.price || !token1?.price || tvlNum.isZero()) {
      return new Decimal(0);
    }

    const yearBn = 100 * 365;
    const staked0Usd = new Decimal(pool.staked0)
      .div(10 ** (token0?.decimals || 18))
      .mul(token0?.price ?? 0);
    const staked1Usd = new Decimal(pool.staked1)
      .div(10 ** (token1?.decimals || 18))
      .mul(token1?.price ?? 0);

    const stakedUsd = staked0Usd.add(staked1Usd);

    if (stakedUsd.isZero()) {
      return new Decimal(0);
    }

    return dailyEmissionUsdNum.div(stakedUsd).mul(yearBn);
  }

  private calculateVolume(
    pool: PoolData,
    token0: TokenResponse | undefined,
    token1: TokenResponse | undefined,
  ): Decimal {
    const poolFee = new Decimal(pool.pool_fee).div(pool.type > 0 ? 10000 : 100);

    if (poolFee.eq(0)) {
      return new Decimal(0);
    }

    const price0 = new Decimal(token0?.price ?? 0);
    const price1 = new Decimal(token1?.price ?? 0);

    const volumePct = new Decimal(100).div(poolFee);

    const token0Fees = new Decimal(pool.token0_fees)
      .div(10 ** (token0?.decimals || 18))
      .mul(price0);
    const token1Fees = new Decimal(pool.token1_fees)
      .div(10 ** (token1?.decimals || 18))
      .mul(price1);

    const totalFeesUsd = token0Fees.add(token1Fees);

    return totalFeesUsd.mul(volumePct);
  }

  private formatValue(value: string, decimals: number): Decimal {
    return new Decimal(formatUnits(BigInt(value), decimals).toString());
  }

  private getFormattedPoolType(type: number): string {
    if (type === 0) {
      return 'Basic Stable';
    } else if (type === -1) {
      return 'Basic Volatile';
    } else if (type > 0 && type <= 50) {
      return 'Concentrated Stable';
    } else if (type > 50) {
      return 'Concentrated Volatile';
    }
    return '';
  }
}
