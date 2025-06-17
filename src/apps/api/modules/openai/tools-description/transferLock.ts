import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const transferLock: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'transferLock',
    description:
      'Transfers a locked AERO token to another wallet. Execution requires user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        lockId: {
          type: 'string',
          description: 'The ID of the lock to transfer.',
        },
        toAddress: {
          type: 'string',
          matchPattern: '^0x[a-fA-F0-9]{40}$',
          description: 'The wallet address to transfer the lock to.',
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
            'If true, the function will simulate the transfer transaction without executing it. "false" must be set after confirming the transfer details.',
        },
      },
      required: ['chainId', 'lockId', 'toAddress', 'token', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
