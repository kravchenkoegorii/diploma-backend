import {
  Address,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  parseAbi,
  TransactionReceipt,
} from 'viem';
import { IToken } from '../types/token';
import { BASE_UNIVERSAL_ROUTER } from '../constants/chains/base/base.contracts';
import { formatNumber } from './round-number';

export const decodeSwapResult = async (
  receipt: TransactionReceipt,
  tokens: IToken[],
  walletAddress: Address,
) => {
  const abi = [
    ...erc20Abi,
    ...parseAbi([
      'event Withdrawal(address,uint256)',
      'event Swap(address,address,uint256,uint256,uint256,uint256)',
      'event Fees(address,uint256,uint256)',
      'event Sync(uint256,uint256)',
    ]),
  ];

  const txResult: Partial<{
    fromSymbol: string;
    fromAmount: string;
    toSymbol: string;
    toAmount: string;
  }> = {};
  for (let i = 0; i < receipt.logs.length; i++) {
    try {
      const log = receipt.logs[i];
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: log.topics,
      });

      const universalRouter = BASE_UNIVERSAL_ROUTER.toLowerCase();

      // Decode Transfer events for actual token movement
      if (
        decoded.eventName === 'Transfer' &&
        (decoded.args.from.toLowerCase() === walletAddress ||
          decoded.args.to.toLowerCase() === walletAddress ||
          decoded.args.from.toLowerCase() === universalRouter ||
          decoded.args.to.toLowerCase() === universalRouter)
      ) {
        const token = tokens?.find(
          (t) => t.token_address.toLowerCase() === log.address.toLowerCase(),
        );

        const from = decoded.args.from.toLowerCase();
        const to = decoded.args.to.toLowerCase();
        const value = formatNumber(
          formatUnits(decoded.args.value, token?.decimals || 18),
          {
            minimumFractionDigits: 1,
            maximumFractionDigits: 6,
          },
        );

        if (!txResult.fromSymbol) {
          if (from === walletAddress) {
            txResult.fromSymbol = token?.symbol;
            txResult.fromAmount = value;
          } else if (
            from === universalRouter &&
            to === walletAddress &&
            receipt.logs.length > 1
          ) {
            txResult.fromSymbol = token?.symbol;
            txResult.fromAmount = value;
          } else if (
            from === universalRouter &&
            token?.symbol.toUpperCase() === 'WETH'
          ) {
            txResult.fromSymbol = 'ETH';
            txResult.fromAmount = value;
          }
        }

        if (to === walletAddress) {
          txResult.toSymbol = token?.symbol;
          txResult.toAmount = value;
        } else if (to === universalRouter) {
          txResult.toSymbol = 'ETH';
          txResult.toAmount = value;
        }
      }
    } catch {}
  }

  if (txResult?.fromSymbol && txResult?.toSymbol) {
    return txResult;
  }
};
