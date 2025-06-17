import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const extendLock: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'extendLock',
    description:
      'Extend Lock duration by lockId. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        duration: {
          type: 'number',
          description:
            'Lock duration in days. Minimum: 7 days, Maximum: 4 years (1460 days).',
        },
        lockId: {
          type: 'string',
          description: 'Exist lock id to extend',
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
      required: ['chainId', 'duration', 'lockId', 'isSimulation', 'token'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
