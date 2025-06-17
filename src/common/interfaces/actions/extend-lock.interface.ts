import { Address } from 'viem';

export interface IExtendLock {
  walletAddress: Address;
  duration: bigint;
  lockId: string;
}
