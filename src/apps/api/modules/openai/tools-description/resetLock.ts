import { TTool } from '../types';

export const resetLock: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'resetLock',
    description:
      'Reset allows a user to reset their vote (unbind the voted veNFT) provided they voted in the previous epoch but have not yet voted in the current one.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the lock. 8453 for Base or 10 for Optimism(OP)`,
          enum: [10, 8453],
        },
        lockId: {
          type: 'number',
          description: 'The ID of the lock',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the poke transaction without executing it. `false` must be set after confirming the poke details.',
        },
      },
      required: ['chainId', 'lockId', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
