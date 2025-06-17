import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getHistoricalTokenPriceByCoingeckoName: TTool = (
  execute,
  toString,
) => ({
  type: 'function',
  function: {
    name: 'getHistoricalTokenPriceByCoingeckoName',
    description:
      'Get token price by NON-EVM Coingecko token name at a specific date or time. For example: yesterday or at 19.10.2021. Yesterday is current date subtract 1 day',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description:
            'Non EVM Coingecko token name in lowercase (e.g. bitcoin, solana, etc.)',
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
      required: ['name', 'date'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
