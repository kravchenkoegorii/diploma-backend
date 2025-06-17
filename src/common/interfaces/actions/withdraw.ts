import { Address } from 'viem';

export interface IWithdraw {
  toAddress: Address;
  poolAddress: Address;
  tokenId: string;
  liquidity: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  token0: Address;
  token1: Address;
  stable: boolean;
  deadline: bigint;
  feeETH: string;
  action: 'withdrawCL' | 'withdrawAMM';
  amountLiquidityToApproveBn?: bigint; //Need for AMM approvement token
  nfpm?: Address; //Needs for CL pool , approvement NFT
}
