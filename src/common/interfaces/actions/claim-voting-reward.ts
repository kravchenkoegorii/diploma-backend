import { Address } from 'viem';

export interface IClaimVotingReward {
  bribes: Address[];
  rewardTokens: Address[][];
  veNFTTokenId: bigint;
  feeBn?: bigint;
  walletAddress: Address;
}
