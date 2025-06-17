import { Address } from 'viem';

export interface IStake {
  walletAddress: Address;
  isClPool: boolean;
  lpToken: Address;
  amountBN: bigint;
  amountToApproveBN: bigint;
  feeBn: bigint;
  gauge: Address;
  tokenId: string;
  nfpm: Address; //Needs for CL pool , approvement NFT
}
