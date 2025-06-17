import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const claimVotingRewards: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'claimVotingRewards',
    description:
      'Claim voting rewards for one or many votes by veNFT ID list or pool symbol list. Execution requires verbal confirmation.',
    parameters: {
      type: 'object',
      properties: {
        votesIds: {
          type: 'array',
          description:
            'The list of veNFT IDs to claim rewards. Each item is an string',
          items: {
            type: 'string',
            description: 'veNFT ID to claim rewards.',
          },
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the claim transaction without executing it. `false` value must be set after confirming the claim details.',
        },
      },
      required: ['votesIds', 'isSimulation', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
