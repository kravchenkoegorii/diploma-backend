import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const withdrawLock: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'withdrawLock',
    description:
      'Withdraw exist lock by "lockId" AERO tokens for a specified duration. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        lockId: {
          type: 'string',
          description: 'Exist lock id to increase',
        },
        token: {
          type: 'string',
          enum: ['AERO', 'VELO'],
          description:
            'The tokens symbol to lock. Token supported : AERO, VELO. For Base chain: AERO, for the rest: VELO',
          default: 'AERO',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the lock withdrawal without executing it. `false` must be set after confirming the lock details.',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['lockId', 'isSimulation', 'token', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
