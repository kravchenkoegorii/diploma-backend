import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getCurrentVotingRound: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getCurrentVotingRound',
    description: 'Get data about current voting round or epoch.',
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
