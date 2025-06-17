import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const claimAllRewards: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'claimAllRewards',
    description:
      'Claim all (fee and emission) rewards from LP positions (one or multiple).' +
      ' You MUST first retrieve claimable positions using `getPositionsByAddress` with `type: "claimAllRewards"`.' +
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
            'The list of positions to claim all (fee and emission) rewards from. Each position is an object with poolSymbol and positionId',
          items: {
            type: 'object',
            description:
              'The object with poolSymbol and positionId to claim all rewards from',
            properties: {
              poolSymbol: {
                type: 'string',
                pattern: '^[sv]AMM.*$|^CL.*$',
                example: 'vAMM-WETH/USDC',
                description:
                  'Pool symbol must start with either "sAMM" (stable),"vAMM" (volatile) or "CL" (concentrated) prefix',
              },
              positionId: {
                type: 'string',
                example: '7734455',
                description: 'Position ID to claim all reward from.',
              },
            },
            required: ['poolSymbol', 'positionId'],
            additionalProperties: false,
          },
          minItems: 1,
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the claim all rewards  transaction without executing it. `false` value must be set after confirming the claim details.',
        },
      },
      required: ['chainId', 'positions', 'isSimulation'],
      additionalProperties: false,
    },
  },
  execute,
});
