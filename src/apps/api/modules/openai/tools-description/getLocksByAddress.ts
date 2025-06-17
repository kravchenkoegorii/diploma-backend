import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getLocksByAddress: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'getLocksByAddress',
    description:
      'Returns all locks for a given address. If no address is provided, the primary wallet address will be used.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        address: {
          type: 'string',
          description:
            'Valid EVM wallet address (0x-prefixed hexadecimal string)',
        },
      },
      required: ['chainId', 'address'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
