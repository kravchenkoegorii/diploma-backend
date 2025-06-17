import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getWalletEarnings: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getWalletEarnings',
    description:
      'Get wallet earnings (Liquidity and Voting rewards) on Aerodrome/Velodrome by address (use default address). If the message is a wallet earnings inquiry. Use only if user asks for his wallet earnings or voting rewards.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        walletAddress: {
          type: 'string',
          description: 'EVM wallet address (e.g. 0x1234...)',
        },
      },
      required: ['chainId', 'walletAddress'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
