import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getHistoricalTokenPrice: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getHistoricalTokenPrice',
    description:
      'Get token price at a specific date or time. For example: yesterday or at 19.10.2021. Yesterday is current date subtract 1 day',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description:
            'Token address. Maybe received from getTokenInfo or getTokenBySymbol',
        },
        date: {
          type: 'string',
          description: 'Date in ISO format',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        searchWidth: {
          type: 'string',
          description: 'Search width. Recommended: 4h',
        },
      },
      required: ['address', 'date'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
