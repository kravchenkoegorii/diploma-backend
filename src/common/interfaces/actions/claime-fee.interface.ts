import { Address, TransactionReceipt } from 'viem';

export interface IClaimFeeBase {
  action: 'claimFee';
  walletAddress?: Address;
  positionId?: string;
  poolSymbol?: string;
}

export interface IClaimFee extends IClaimFeeBase {
  success: true;
  walletAddress: Address;
  poolAddress: Address;
  tokenId: bigint;
  feeBn: bigint;
  isClPool: boolean;
  nfpm: Address;

  // Additional fields
  poolSymbol: string;
  positionId: string;
  chainId: number;
  token0FeesEarned: string | undefined;
  token1FeesEarned: string | undefined;
  token0Symbol: string | undefined;
  token1Symbol: string | undefined;
  token0FeesEarnedUSD: string | undefined;
  token1FeesEarnedUSD: string | undefined;
  gasFormatted: string;
  gasUSD: string;
  warningMessages: string[];
}

export interface IClaimFeeError extends IClaimFeeBase {
  success: false;
  action: 'claimFee';
  isSimulation: boolean;
  chainId: number;
  message: string;
}

export interface IClaimFeeResult extends IClaimFeeBase {
  success: true;
  isSimulation: boolean;
  chainId: number;
  receipt?: TransactionReceipt;
  poolSymbol: string;
  errorMessage?: string;
  action: 'claimFee';
}
