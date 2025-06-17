import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const lockTokens: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'lockTokens',
    description:
      'Locks AERO tokens for a specified duration. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        amount: {
          type: 'number',
          description: 'Number of AERO tokens to lock.',
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
        lockUntilCurrentEpoch: {
          type: 'boolean',
          description:
            'If true, the function lock tokens to the end of the current epoch and without `duration` parameter. If false, the function lock tokens to the beginning of the next epoch and pass `duration` parameter.',
        },
        duration: {
          type: 'number',
          description:
            'Lock duration in days. Minimum: 1 day, Maximum: 4 years (1460 days). If `lockUntilCurrentEpoch` is true, `duration` is 0. If `lockUntilCurrentEpoch` is false, pass `duration` parameter in days.',
        },
      },
      required: [
        'chainId',
        'amount',
        'token',
        'isSimulation',
        'lockUntilCurrentEpoch',
        'duration',
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
