import { Address } from 'viem';

export type IClaimLock = {
  walletAddress: Address;
  feeBn: bigint;
  lockIds: string[];
};
