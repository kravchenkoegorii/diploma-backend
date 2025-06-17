import { Address } from 'viem';

export interface ITransferLock {
  walletAddress: Address;
  lockId: string;
  toAddress: Address;
  feeBn: bigint;
}
