import { Address } from 'viem';

export type IWithdrawLock = {
  walletAddress: Address;
  feeBn: bigint;
  lockId: string;
};
