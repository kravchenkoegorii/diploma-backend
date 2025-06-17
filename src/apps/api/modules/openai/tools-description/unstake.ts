import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const unstake: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'unstake',
    description:
      'Unstake LP tokens from pool by position id.' +
      'Execution requires verbal confirmation.' +
      'If user does not provide all needed data for unstaking, you HAVE TO ask him about needed parameters.' +
      'You are not allowed to start transactions without specifying all function parameters with the user.' +
      '**IMPORTANT**: DO NOT use "withdrawAMMPoolLiquidity" or "withdrawCLPoolLiquidity" for unstaking LP tokens for the pool (position).',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        poolSymbol: {
          type: 'string',
          matchPattern: '^[sv]AMM.*$|^CL.*$',
          description:
            'Pool symbol must start with either "sAMM" (stable),"vAMM" (volatile) or "CL" (concentrated) prefix (e.g., "sAMM-WETH/USDC", "vAMM-USDC/AERO"  , "CL100-WETH/USDC")',
        },
        positionId: {
          type: 'string',
          description: 'Position ID to unstake LP tokens.',
        },
        amount: {
          type: 'number',
          description:
            'Number of LP tokens in percent (allowed from 0.1 to 1.0).' +
            '**IMPORTANT**: User have to choose the amount for unstaking by himself, ALWAYS ask user about it for unstaking.' +
            'DO NOT make it up yourself.',
          example: 0.1,
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the unstaking transactions without executing them. `false` value must be set after confirming the unstake details.',
        },
      },
      required: [
        'poolSymbol',
        'positionId',
        'amount',
        'isSimulation',
        'chainId',
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
