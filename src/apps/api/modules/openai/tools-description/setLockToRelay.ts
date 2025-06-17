import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const setLockToRelay: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'setLockToRelay',
    description:
      'Set the user`s lock to the relay. Execution requires verbal confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        lockId: {
          type: 'string',
          description: 'The user`s lock ID.',
          example: '12345',
        },
        relayId: {
          type: 'string',
          description: 'The relay ID.',
          example: '10298',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the set lock transaction without executing it. `false` value must be set after confirming the set lock details.',
        },
      },
      required: ['chainId', 'lockId', 'relayId', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
