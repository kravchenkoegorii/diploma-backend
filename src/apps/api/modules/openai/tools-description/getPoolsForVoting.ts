import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getPoolsForVoting: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getPoolsForVoting',
    description:
      'Returns a list of the most relevant pools for voting or investment analysis on Aerodrome/Velodrome.\n' +
      '- Use this tool when the user explicitly asks to vote, or demonstrates an intent to vote (e.g., “show pools I can vote”, “where to allocate votes”, “best voting pools”).\n' +
      '- Suggest the user to choose one or more pools from the result.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
