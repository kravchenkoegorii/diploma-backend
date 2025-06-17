import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getWalletBalances: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getWalletBalances',
    description:
      "Retrieve total token balances for a specified EVM wallet address. Defaults to user's primary wallet if no address is provided. \
    Always call this method to get fresh balances. \
    ⚠️ Never reuse previously retrieved data. Repeated requests must always call this function, even if identical parameters were used before.",
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description:
            'Valid EVM wallet address (0x-prefixed hexadecimal string)',
        },
        chains: {
          type: 'array',
          description:
            'List of the chains, use desired chains, or all recommended for all',
          items: {
            type: 'string',
            description: `Chains IDs. ${recommendedChains}`,
          },
        },
      },
      required: ['walletAddress', 'chains'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
