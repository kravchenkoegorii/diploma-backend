import { Address } from 'viem';

export interface IIncreaseLock {
  walletAddress: Address;
  feeBn: bigint;
  amountBn: bigint;
  token_address: Address;
  amountToApproveBn: bigint;
  lockId: string;
}
