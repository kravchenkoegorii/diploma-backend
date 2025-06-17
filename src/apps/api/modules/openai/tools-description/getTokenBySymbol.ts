import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getTokenBySymbol: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getTokenBySymbol',
    description: 'Get price in USD of any token by symbol in Base Chain',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Token symbol. For example: ETH, BTC, USDT',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['symbol', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
