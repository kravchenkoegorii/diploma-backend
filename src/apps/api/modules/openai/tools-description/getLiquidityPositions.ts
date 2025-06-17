import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getLiquidityPositions: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getLiquidityPositions',
    description:
      "Get user's liquidity positions by wallet address (use default address, only if user did not provide any other). If the message is wallet liquidity positions inquiry. Use only if user asks for his wallet liquidity positions.",
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
        type: {
          type: 'string',
          description: 'Type of response for liquidity positions',
          enum: ['liquidity', 'staked', 'unstaked'],
        },
      },
      required: ['chainId', 'walletAddress', 'type'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
