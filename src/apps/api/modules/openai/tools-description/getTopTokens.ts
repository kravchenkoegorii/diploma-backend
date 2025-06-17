import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getTopTokens: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getTopTokens',
    description:
      'Get the top tokens by volume, market cap, or price. By default sorted from best to worst.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        orderBy: {
          type: 'string',
          description: 'Sort pools by a specific field.',
          enum: ['volume_24h', 'market_cap', 'price'],
        },
        sortOrder: {
          type: 'string',
          description:
            'Sort order. Sorting must be by `desc` (from best to worst) by default.',
          enum: ['desc', 'asc'],
          default: 'desc',
        },
        filters: {
          type: 'object',
          description:
            'Filter tokens by specific properties. Any field in TokenResponse can be used.',
          properties: {
            symbol: {
              type: 'string',
              description: 'Token symbol',
            },
            token_address: {
              type: 'string',
              description: 'Token EVM address (0x...)',
            },
            listed: {
              type: 'boolean',
              description:
                'Is token listed on Aerodrome. Pass `true` by default',
            },
            is_meme: {
              type: 'boolean',
              description: 'Is token meme-coin',
            },
            min_volume_24h: {
              type: 'number',
              description: 'Minimum volume in USD',
            },
            max_volume_24h: {
              type: 'number',
              description: 'Maximum volume in USD',
            },
            min_market_cap: {
              type: 'number',
              description: 'Minimum market cap in USD',
            },
            max_market_cap: {
              type: 'number',
              description: 'Maximum market cap in USD',
            },
          },
          additionalProperties: false,
          required: [],
        },
      },
      additionalProperties: false,
      required: ['chainId', 'orderBy', 'sortOrder', 'filters'],
    },
  },
  execute,
  toString,
});
