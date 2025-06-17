import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getTokenInfo: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getTokenInfo',
    description:
      'Get token info by token address (including price). Search by address of any token',
    parameters: {
      type: 'object',
      properties: {
        tokenAddress: {
          type: 'string',
          description:
            'Valid EVM token address (0x-prefixed hexadecimal string)',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['tokenAddress', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
