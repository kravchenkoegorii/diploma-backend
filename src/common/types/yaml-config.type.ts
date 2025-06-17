import { Address } from 'viem';

export type TFeeDetails = {
  FEE_PCT: number;
  MIN_REWARD_AMOUNT_USD: number;
  IS_DISABLED_FOR_CLAIMING_REWARDS: boolean;
};

export type YamlConfig = {
  FEE_DETAILS: TFeeDetails;
  TOTAL_MESSAGES_REQUEST_LIMIT: number;

  FEE_MASTER_WALLET_ADDRESS: Record<number, Address>;
  SWAPPER_CONTRACTS: Record<number, Address>;
};
