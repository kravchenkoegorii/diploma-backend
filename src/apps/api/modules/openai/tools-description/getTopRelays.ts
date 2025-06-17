import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getTopRelays: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getTopRelays',
    description: 'Get relays for Aerodrome.',
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
            "Sender's EVM wallet address (defaults to primary wallet)",
        },
      },
      required: ['chainId', 'address'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
