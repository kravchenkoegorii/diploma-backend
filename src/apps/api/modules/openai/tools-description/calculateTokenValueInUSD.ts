import { TTool } from '../types';

export const calculateTokenValueInUSD: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    description: 'Calculate token value in USD',
    name: 'calculateTokenValueInUSD',
    parameters: {
      type: 'object',
      properties: {
        tokenPriceInUSD: {
          type: 'number',
          description: 'Price of token in USD',
        },
        amount: {
          type: 'number',
          description: 'Amount of token',
        },
      },
      required: ['tokenPriceInUSD', 'amount'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
