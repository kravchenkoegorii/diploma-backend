import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getWalletPnlSinceYesterday: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getWalletPnlSinceYesterday',
    description:
      'Get wallet earnings since yesterday by wallet address (use default address, only if user did not provide any other). If the message is a wallet earnings inquiry. Use only if user asks for his wallet earnings since yesterday.',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'EVM wallet address (e.g. 0x1234...)',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['walletAddress', 'chainId'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
