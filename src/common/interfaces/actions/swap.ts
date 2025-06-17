import { Address } from 'viem';

export interface ISwap {
  success: boolean;
  fromAddress: Address;
  action:
    | 'swapExactETHForTokens'
    | 'swapExactTokensForETH'
    | 'swapExactTokensForTokens';
  token0: Address;
  token1: Address;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  routes: (Address | number)[];
  rate: number;
  slippage: number;
  gas: string;
  gasFormatted: string;
  feeETH: string;
  feeAddress: Address;
  isWrapping: boolean;
  isUnwrapping: boolean;
}
