import { Address } from 'viem';

export interface IUnstake {
  walletAddress: Address;
  isAlmPool: boolean;
  isClPool: boolean;
  lpToken: Address;
  amountBn: bigint;
  amountToApproveBn: bigint;
  feeBn: bigint;
  gauge: Address;
  tokenId: bigint;
  nfpm: Address; //Needs for CL pool , approvement NFT
}
