import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const swap: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'swap',
    description:
      'Calculate or execute multiple swap transactions in a single call. Execution requires verbal confirmation. Optionally, this swap can be part of a broader action (e.g., deposit, lock creation). Use `actionContext` to store any relevant metadata.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tokenIn: {
                type: 'string',
                description:
                  'The symbol of the token to swap from. E.g. "ETH", "USDC", "DAI". etc',
              },
              tokenOut: {
                type: 'string',
                description:
                  'The symbol of the token to swap to. E.g. "ETH", "USDC", "DAI". etc',
              },
              amount: {
                type: 'number',
                description: 'The amount exact of tokenIn or tokenOut.',
              },
              isAmountIn: {
                type: 'boolean',
                description:
                  'Determines whether `amount` argument is amount of tokenIn or tokenOut. If true, the amount is the exact amount of tokenIn to swap. If false, the amount is the exact amount of tokenOut to receive',
              },
              fromAddress: {
                type: 'string',
                description:
                  "Sender's EVM wallet address (defaults to primary wallet)",
              },
            },
            required: [
              'tokenIn',
              'tokenOut',
              'amount',
              'isAmountIn',
              'fromAddress',
            ],
            additionalProperties: false,
          },
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, simulates the swap transactions without executing them. Set to false to proceed with execution after confirmation.',
        },
        actionContext: {
          type: 'string',
          description:
            'Optional metadata describing the broader action this swap is part of (e.g., deposit, lock creation). You may include any information relevant to that context.',
          additionalProperties: false,
        },
      },
      required: ['chainId', 'transactions', 'isSimulation', 'actionContext'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
