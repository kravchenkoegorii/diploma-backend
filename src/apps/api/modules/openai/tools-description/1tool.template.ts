import { TTool } from '../types';

export const name: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: '',
    description: '',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
