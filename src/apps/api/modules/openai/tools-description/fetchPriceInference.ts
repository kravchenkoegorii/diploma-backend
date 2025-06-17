import { TTool } from '../types';

export const fetchPriceInference: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'fetchPriceInference',
    description:
      'Fetch price prediction for tokens "ETH" and "BTC" on timeframes "5m" or "8h". Key words: predict, prediction.',
    parameters: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          enum: ['ETH', 'BTC'],
          description: 'Token symbol. ONLY "ETH" or "BTC".',
        },
        timeframe: {
          type: 'string',
          enum: ['5m', '8h'],
          description: 'Timeframe for price prediction. ONLY "5m" or "8h".',
        },
        isCompare: {
          type: 'boolean',
          description: 'Is need to compare current and predicted price?',
        },
      },
      required: ['token', 'timeframe', 'isCompare'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
