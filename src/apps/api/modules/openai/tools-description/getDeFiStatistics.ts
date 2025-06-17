import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getDeFiStatistics: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getDeFiStatistics',
    description:
      'Get aerodrome statistic (Total TVL in USD, total fees in USD, total volume in USD, total number of pools, total number of tokens, total number of relays, etc.).',
    parameters: {
      type: 'object',
      properties: {
        chainIds: {
          type: 'array',
          description: `List of supported chaind, ${recommendedChains}`,
          items: {
            type: 'number',
            description: `Chain ID. ${recommendedChains}`,
          },
        },
      },
      required: ['chainIds'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
