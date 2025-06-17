import { IToken } from 'src/common/types/token';
import { Address, ReadContractReturnType } from 'viem';
import { sugarAbi } from '../constants/chains/abis/sugar.abi';
import { rewardsAbi } from '../constants/chains/abis/rewards.abi';
import { veSugarAbi } from '../constants/chains/abis/ve-sugar.abi';
import { rewardsSugarAbi } from '../constants/chains/abis/rewards-sugar.abi';

export interface ITokenInfo {
  chainId: number;
  address: Address;
  name: string;
  displayName: string;
  symbol: string;
  decimals?: number;
  price: number;
  marketCap?: number;
  volume24h?: number;
  scan_url?: string;
}

export interface PoolData {
  lp: Address;
  symbol: string;
  decimals: number;
  liquidity: string;
  type: number;
  tick: number;
  sqrt_ratio: string;
  token0: Address;
  reserve0: string;
  staked0: string;
  token1: Address;
  reserve1: string;
  staked1: string;
  gauge: Address;
  gauge_liquidity: string;
  gauge_alive: boolean;
  fee: string;
  bribe: string;
  factory: Address;
  emissions: string;
  emissions_token: string;
  pool_fee: number;
  unstaked_fee: number;
  token0_fees: string;
  token1_fees: string;
  nfpm: string;
  alm: Address;
  root: string;

  tokenPrice0?: string;
  tokenPrice1?: string;

  token0Symbol?: string;
  token1Symbol?: string;

  reserveInUsd0?: string;
  reserveInUsd1?: string;
  stakedInUsd0?: string;
  stakedInUsd1?: string;
  tvl?: string;
  apr?: string;
  rebateApr?: string;
  volume?: string;
  dailyEmissionUsd?: string;

  votes: string;
  votesPercent?: number;
  bribes: {
    token: Address;
    amount: string;
  }[];
  fees: {
    token: Address;
    amount: string;
  }[];
  vApr?: string;
  totalFeesInUSD?: number;
  totalIncentivesInUSD?: number;
  totalRewardsInUSD?: number;

  formattedType?: string;

  poolUrl?: string;

  chainId?: number;
}

export interface TokenResponse extends Omit<IToken, 'account_balance'> {
  token_address: Address;
  symbol: string;
  decimals: number;
  account_balance: string;
  listed: boolean;
  chainId?: number;
  price?: string;
  scan_url?: string;
  shortDescrFromAi?: string;
}

export type TPosition = ReadContractReturnType<
  typeof sugarAbi,
  'positionsUnstakedConcentrated'
>[0];

export interface IPosition extends TPosition {
  symbol?: string;
  token0Address?: Address;
  token0Symbol?: string;
  token0Decimals?: number;
  token1Address?: Address;
  token1Symbol?: string;
  token1Decimals?: number;
  poolBalance0?: bigint;
  poolBalance1?: bigint;
  accountBalance0?: bigint;
  accountBalance1?: bigint;
  emissionsTokenAddress?: Address;
  emissionsTokenSymbol?: string;
  emissionsTokenDecimals?: number;
  emissionsEarned?: string;
  emissionsEarnedUSD?: string;
  emissionsToken?: string;
  token0?: string;
  token1?: string;
  token0FeesEarned?: string;
  token0FeesEarnedUSD?: string;
  token1FeesEarned?: string;
  token1FeesEarnedUSD?: string;
  amount0USD?: string;
  amount1USD?: string;
  staked0USD?: string;
  staked1USD?: string;
  isActive?: boolean;
  isCl?: boolean;
}

export type RangeValue = [number, string] | string;

export interface Ranges {
  [spacing: number]: RangeValue;
}

export interface RangeConfig {
  title: string;
  ranges: Ranges;
}

export interface IPoolsFilter
  extends Partial<Record<keyof PoolData, PoolData[keyof PoolData]>> {
  isExotic?: boolean;
  useStartsWith?: boolean;
  type?: string;
  typeByStability?: string;
  mostRewarded?: boolean;

  [key: `min_${string}`]: number;

  [key: `max_${string}`]: number;
}

export type TPoolReward = ReadContractReturnType<
  typeof rewardsAbi,
  'epochsLatest'
>[0] & { chainId?: number };

export type TLock = ReadContractReturnType<typeof veSugarAbi, 'byAccount'>[0];

export type TVotingReward = ReadContractReturnType<
  typeof rewardsSugarAbi,
  'rewards'
>[0];

export type IExtendedVote = TLock['votes'][number] & {
  pool_symbol?: string;
};

export interface ILock extends Omit<TLock, 'votes'> {
  token_symbol: string;
  votes: IExtendedVote[];
}

export interface IVotingReward extends TVotingReward {
  pool: Pick<PoolData, 'lp' | 'symbol' | 'type'>;
  token_symbol?: string;
  token_decimals?: number;
  token0_symbol?: string;
  token1_symbol?: string;
}

export interface EpochData {
  chainId: number;
  epochCount: number;
  totalSupply: string;
  endsAt: string;
  endInMs: string;
  newEmissions: string;
  totalFeesForPreviousEpoch?: string;
  totalIncentivesForPreviousEpoch?: string;
  totalRewardsForPreviousEpoch?: number;
  epochStartedAt?: string;
}

export interface IRebaseAprData {
  chainId: number;
  rebaseApr: string;
  votingTokenAddress?: Address;
  tokenSupply: string;
  decimals: number;
  weeklyGrowth: string;
}
