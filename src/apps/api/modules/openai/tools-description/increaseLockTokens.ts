import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const increaseLockTokens: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'increaseLockTokens',
    description:
      'Increase exist lock by "lockId" AERO tokens for a specified duration. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        amount: {
          type: 'number',
          description: 'Number of AERO tokens to increase.',
        },
        lockId: {
          type: 'string',
          description: 'Exist lock id to increase',
        },
        token: {
          type: 'string',
          enum: ['AERO', 'VELO'],
          description:
            'The tokens symbol to lock. Token supported : AERO, VELO',
          default: 'AERO',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the lock transaction without executing it. `false` must be set after confirming the lock details.',
        },
      },
      required: ['chainId', 'amount', 'lockId', 'isSimulation', 'token'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
