import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const stake: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'stake',
    description:
      'Stake LP tokens to earn additional rewards.' +
      'Execution requires verbal confirmation.' +
      'If user does not provide all needed data for staking, you HAVE TO ask him about needed parameters.' +
      'You are not allowed to start transactions without specifying all function parameters with the user.',
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
          description: 'Position ID to stake LP tokens.',
        },
        amount: {
          type: 'number',
          description:
            'Number of LP tokens in percent (allowed from 0.1 to 1.0).' +
            'User have to choose the amount for staking by himself.' +
            'DO NOT make it up yourself.',
          example: 0.1,
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the staking transactions without executing them. `false` value must be set after confirming the stake details.',
        },
      },
      required: [
        'chainId',
        'poolSymbol',
        'positionId',
        'amount',
        'isSimulation',
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
