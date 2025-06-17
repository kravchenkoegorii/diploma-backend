import { Address, TransactionReceipt } from 'viem';

export interface IClaimEmissionBase {
  action: 'claimEmission';
  walletAddress?: Address;
  positionId?: string;
  poolSymbol?: string;
}

export interface IClaimEmission extends IClaimEmissionBase {
  success: true;
  action: 'claimEmission';
  walletAddress: Address;
  tokenId: bigint;
  feeBn: bigint;
  isClPool: boolean;
  gauge: Address;
  isAlmPool: boolean;
  alm: Address;

  // Aditional fields
  poolSymbol: string;
  positionId: string;
  emissionsEarned?: string;
  gasFormatted: string;
  emissionToken?: string;
  emissionsEarnedUSD?: string;
  gasUSD: string;
  warningMessages: string[];
  chainId: number;
}

export interface IClaimEmissionError extends IClaimEmissionBase {
  success: false;
  action: 'claimEmission';
  isSimulation: boolean;
  chainId: number;
  message: string;
}

export interface IClaimEmissionResult extends IClaimEmissionBase {
  success: true;
  isSimulation: boolean;
  errorMessage?: string;
  poolSymbol?: string;
  receipt?: TransactionReceipt;
  action: 'claimEmission';
  chainId: number;
}
