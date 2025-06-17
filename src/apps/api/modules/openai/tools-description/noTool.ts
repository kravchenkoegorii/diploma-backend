import { TTool } from '../types';

export const noTool: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'noTool',
    description:
      "This tool does nothing and returns nothing. So it let's you answer with just text without any additional processing." +
      'Use this tool when you need to ask a question or provide an answer without any additional processing.',
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
