import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getHistoricalTokenPriceBySymbol: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getHistoricalTokenPriceBySymbol',
    description:
      'Get token price by symbol at a specific date or time. For example: yesterday or at 19.10.2021. Yesterday is current date subtract 1 day',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of token. ${recommendedChains}`,
        },
        symbol: {
          type: 'string',
          description: 'Token symbol (e.g. ETH, BTC, USDT)',
        },
        date: {
          type: 'string',
          description: 'Date in ISO format',
        },
        searchWidth: {
          type: 'string',
          description: 'Search width. Recommended: 4h',
        },
      },
      required: ['symbol', 'date'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
