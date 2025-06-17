import { ResponseTextConfig } from 'openai/resources/responses/responses';

export const getTopTokensSchema: ResponseTextConfig = {
  format: {
    type: 'json_schema',
    name: 'getTopTokens',
    schema: {
      type: 'object',
      properties: {
        tokens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              tokenAddress: { type: 'string' },
              shortOpinionAboutToken: { type: 'string' },
            },
            required: ['tokenAddress', 'shortOpinionAboutToken'],
            additionalProperties: false,
          },
        },
      },
      required: ['tokens'],
      additionalProperties: false,
    },
    description:
      'Additionally, add short comment with your opinion, use shortOpinionAboutToken field for it.',
  },
};
