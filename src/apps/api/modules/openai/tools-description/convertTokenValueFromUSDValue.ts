import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const convertTokenValueFromUSDValue: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'convertTokenValueFromUSDValue',
    description:
      'Convert a dollar-denominated amount (e.g., $10) into token units based on the current USD price of the given token symbol.',
    parameters: {
      type: 'object',
      properties: {
        tokenSymbol: {
          type: 'string',
          description: 'Symbol of the token (e.g., ETH, USDC, WETH)',
        },
        amountInUSD: {
          type: 'number',
          description: 'The amount in USD to convert into token units',
        },
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
      },
      required: ['tokenSymbol', 'amountInUSD', 'chainId'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
