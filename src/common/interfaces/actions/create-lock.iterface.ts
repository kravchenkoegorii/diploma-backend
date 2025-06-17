import { Address } from 'viem';

export interface ICreateLock {
  walletAddress: Address;
  feeBn: bigint;
  amountBn: bigint;
  duration: bigint; // in sec
  token_address: Address;
  amountToApproveBn: bigint;
}
