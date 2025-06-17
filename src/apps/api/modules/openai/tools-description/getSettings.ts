import { TTool } from '../types';

export const getSettings: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getSettings',
    description: 'Get user settings',
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
