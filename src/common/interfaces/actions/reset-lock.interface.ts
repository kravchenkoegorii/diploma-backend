import { Address } from 'viem';

export interface IResetLock {
  walletAddress: Address;
  lockId: number;
}
