import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getWalletBalanceBySymbol: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getWalletBalanceBySymbol',
    description:
      'Fetch balance for a specific token in a given EVM wallet. ' +
      "Defaults to user's primary wallet if no address is specified. ",
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description:
            'Valid EVM wallet address (0x-prefixed hexadecimal string)',
        },
        tokenSymbol: {
          type: 'string',
          description:
            "Exact token symbol (case-sensitive, e.g., 'ETH', 'USDT')",
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['walletAddress', 'tokenSymbol', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
