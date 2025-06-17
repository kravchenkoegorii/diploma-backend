import { Address } from 'viem';

export interface IMergeLocks {
  walletAddress: Address;
  feeBn: bigint;
  lockIds: bigint[];
}
