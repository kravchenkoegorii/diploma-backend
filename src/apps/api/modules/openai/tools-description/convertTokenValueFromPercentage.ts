import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const convertTokenValueFromPercentage: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'convertTokenValueFromPercentage',
    description:
      "Convert a percentage of the user's token balance into token units. For example, 25% of user's ETH balance.",
    parameters: {
      type: 'object',
      properties: {
        tokenSymbol: {
          type: 'string',
          description: 'Symbol of the token (e.g., ETH, USDC, WETH)',
        },
        percentage: {
          type: 'number',
          description:
            "Percentage (0–100) of the user's current token balance to convert into token units",
        },
        walletAddress: {
          type: 'string',
          description:
            'EVM wallet address of the user. If not provided, use the default/primary wallet.',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['tokenSymbol', 'percentage', 'walletAddress', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
