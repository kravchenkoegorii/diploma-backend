import { BASE_BLOCK_TIME_SECONDS, BASE_DEFI_ID, BASE_ID } from './base';
import {
  BASE_FACTORY_CONTRACT,
  BASE_FACTORY_REGISTRY,
  BASE_MINTER,
  BASE_MIXED_QUOTER,
  BASE_REWARDS_DISTRIBUTOR,
  BASE_REWARDS_SUGAR,
  BASE_ROUTER,
  BASE_SLIPSTREAM_SUGAR,
  BASE_STABLE_TOKEN,
  BASE_SUGAR_CONTRACT,
  BASE_SUGAR_RELAYS,
  BASE_TOKEN_RATES,
  BASE_UNIVERSAL_ROUTER,
  BASE_VE_SUGAR,
  BASE_VOTER,
  BASE_VOTING_ESCROW,
} from './base/base.contracts';
import {
  OPTIMISM_BLOCK_TIME_SECONDS,
  OPTIMISM_DEFI_ID,
  OPTIMISM_ID,
} from './optimism';
import {
  OPTIMISM_FACTORY_CONTRACT,
  OPTIMISM_FACTORY_REGISTRY,
  OPTIMISM_MINTER,
  OPTIMISM_MIXED_QUOTER,
  OPTIMISM_REWARDS_SUGAR,
  OPTIMISM_ROUTER,
  OPTIMISM_SLIPSTREAM_SUGAR,
  OPTIMISM_STABLE_TOKEN,
  OPTIMISM_SUGAR_CONTRACT,
  OPTIMISM_SUGAR_RELAYS,
  OPTIMISM_TOKEN_RATES,
  OPTIMISM_UNIVERSAL_ROUTER,
  OPTIMISM_VE_SUGAR,
  OPTIMISM_VOTER,
  OPTIMISM_VOTING_ESCROW,
} from './optimism/optimism.contracts';
import { Address } from 'viem';

interface IChainConfig {
  chainId: number;
  blockTime: number;
  defiId?: number;
  scanBaseUrl: string;

  factoryRegistry: Address;
  factoryContract: Address;
  router: Address;
  voter: Address;
  universalRouter: Address;
  mixedQuoter: Address;
  minter: Address;
  votingEscrow: Address;
  sugarContract: Address;
  veSugar: Address;
  rewardsSugar: Address;
  slipstreamSugar: Address;
  sugarRelays: Address;
  tokenRates: Address;
  rewardsDistributor?: Address;
  stableToken: Address;
  forceMaxRatio: bigint;
}

export const chainsConfig: Record<number, IChainConfig> = {
  [BASE_ID]: {
    chainId: BASE_ID,
    blockTime: BASE_BLOCK_TIME_SECONDS,
    defiId: BASE_DEFI_ID,
    scanBaseUrl: 'https://basescan.org',

    factoryRegistry: BASE_FACTORY_REGISTRY,
    factoryContract: BASE_FACTORY_CONTRACT,
    router: BASE_ROUTER,
    voter: BASE_VOTER,
    universalRouter: BASE_UNIVERSAL_ROUTER,
    mixedQuoter: BASE_MIXED_QUOTER,
    minter: BASE_MINTER,
    votingEscrow: BASE_VOTING_ESCROW,
    sugarContract: BASE_SUGAR_CONTRACT,
    veSugar: BASE_VE_SUGAR,
    rewardsSugar: BASE_REWARDS_SUGAR,
    slipstreamSugar: BASE_SLIPSTREAM_SUGAR,
    sugarRelays: BASE_SUGAR_RELAYS,
    tokenRates: BASE_TOKEN_RATES,
    rewardsDistributor: BASE_REWARDS_DISTRIBUTOR,
    stableToken: BASE_STABLE_TOKEN,
    forceMaxRatio: BigInt(4),
  },
  [OPTIMISM_ID]: {
    chainId: OPTIMISM_ID,
    blockTime: OPTIMISM_BLOCK_TIME_SECONDS,
    defiId: OPTIMISM_DEFI_ID,
    scanBaseUrl: 'https://optimistic.etherscan.io',

    factoryRegistry: OPTIMISM_FACTORY_REGISTRY,
    factoryContract: OPTIMISM_FACTORY_CONTRACT,
    router: OPTIMISM_ROUTER,
    voter: OPTIMISM_VOTER,
    universalRouter: OPTIMISM_UNIVERSAL_ROUTER,
    mixedQuoter: OPTIMISM_MIXED_QUOTER,
    minter: OPTIMISM_MINTER,
    votingEscrow: OPTIMISM_VOTING_ESCROW,
    sugarContract: OPTIMISM_SUGAR_CONTRACT,
    veSugar: OPTIMISM_VE_SUGAR,
    rewardsSugar: OPTIMISM_REWARDS_SUGAR,
    slipstreamSugar: OPTIMISM_SLIPSTREAM_SUGAR,
    sugarRelays: OPTIMISM_SUGAR_RELAYS,
    tokenRates: OPTIMISM_TOKEN_RATES,
    stableToken: OPTIMISM_STABLE_TOKEN,
    forceMaxRatio: BigInt(8),
  },
};
