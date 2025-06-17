import { TTool } from '../types';

export const getKnowledge: TTool = (
  execute,
  toString,
  knowledgeKeys: string[],
) => ({
  type: 'function',
  function: {
    name: 'getKnowledge',
    description: 'Get knowledge about a specific topic',
    parameters: {
      type: 'object',
      properties: {
        keyWord: {
          type: 'string',
          description: 'Key word to search for',
          enum: knowledgeKeys,
        },
      },
      required: ['keyWord'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
