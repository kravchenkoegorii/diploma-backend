import { TTool } from '../types';

export const compareValues: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'compareValues',
    description:
      'Compares two numbers and returns:\n' +
      '1. isFirstGreater — whether the first number is greater than the second;\n' +
      '2. difference — the absolute difference between the two numbers.' +
      ' Use it to compare balance and required amount',
    parameters: {
      type: 'object',
      properties: {
        firstValue: {
          type: 'number',
          description: 'The first number to compare.',
        },
        secondValue: {
          type: 'number',
          description: 'The second number to compare.',
        },
      },
      required: ['firstValue', 'secondValue'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
