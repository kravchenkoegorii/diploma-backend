'use strict';

import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getWalletBalanceBySymbolForPair: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getWalletBalanceBySymbolForPair',
    description:
      'Fetch balance for a specific tokens pair in a given EVM wallet. ' +
      "Defaults to user's primary wallet if no address is specified. " +
      'Always use this tool before deposit (add liquidity) simulation.' +
      'insufficientAmountsForSwapInUsd field contains info about how much token USD value needs to be swapped to cover the required amount',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description:
            'Valid EVM wallet address (0x-prefixed hexadecimal string)',
        },
        token1RequiredUsdAmount: {
          type: 'number',
          description: 'Required USD amount for token1.',
        },
        token1Symbol: {
          type: 'string',
          description: 'Symbol of token1 (e.g., "ETH").',
        },
        token2RequiredUsdAmount: {
          type: 'number',
          description: 'Required USD amount for token2.',
        },
        token2Symbol: {
          type: 'string',
          description: 'Symbol of token2 (e.g., "USDC").',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: [
        'walletAddress',
        'token1RequiredUsdAmount',
        'token1Symbol',
        'token2RequiredUsdAmount',
        'token2Symbol',
        'chainId',
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
