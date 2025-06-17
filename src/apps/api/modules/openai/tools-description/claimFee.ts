import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const claimFee: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'claimFee',
    description:
      'Claim fee rewards from LP positions (one or multiple).' +
      ' You MUST first retrieve claimable positions using `getPositionsByAddress` with `type: "claimFee"`.' +
      ' Display those positions to the user and allow them to select which to claim from.' +
      ' NEVER assume or fabricate positions. Execution requires explicit user confirmation. Simulation must come first.',

    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        positions: {
          type: 'array',
          description:
            'The list of positions to claim fee from. Each position is an object with poolSymbol and positionId',
          items: {
            type: 'object',
            description:
              'The object with poolSymbol and positionId to claim fee from',
            properties: {
              poolSymbol: {
                type: 'string',
                matchPattern: '^[sv]AMM.*$|^CL.*$',
                example: 'vAMM-WETH/USDC',
                description:
                  'Pool symbol must start with either "sAMM" (stable),"vAMM" (volatile) or "CL" (concentrated) prefix',
              },
              positionId: {
                type: 'string',
                example: '7734455',
                description: 'Position ID to claim fee from.',
              },
            },
            required: ['poolSymbol', 'positionId'],
            additionalProperties: false,
          },
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the claim transaction without executing it. `false` value must be set after confirming the claim details.',
        },
      },
      required: ['chainId', 'positions', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
