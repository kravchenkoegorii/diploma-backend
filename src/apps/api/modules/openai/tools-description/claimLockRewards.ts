import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const claimLockRewards: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'claimLockRewards',
    description:
      'Claim lock rewards and rebase lock(one or multiple). Execution requires verbal confirmation.',
    parameters: {
      type: 'object',
      properties: {
        lockList: {
          type: 'array',
          description:
            'The list of locks to claim rewards + rebase from. Each item is an string',
          items: {
            type: 'string',
            description: 'Lock Id to claim rewards + rebase from.',
          },
        },
        token: {
          type: 'string',
          enum: ['AERO', 'VELO'],
          description:
            'The tokens symbol of the lock. Token supported : AERO, VELO',
          default: 'AERO',
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
      required: ['lockList', 'isSimulation', 'token', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
