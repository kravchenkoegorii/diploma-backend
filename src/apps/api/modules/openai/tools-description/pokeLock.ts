import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const pokeLock: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'pokeLock',
    description:
      'Poke will sync up the new voting power with the existing lock votes. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        lockId: {
          type: 'string',
          description: 'Exist lock ID to poke',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the lock transaction without executing it. `false` must be set after confirming the lock details.',
        },
      },
      required: ['chainId', 'lockId', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
