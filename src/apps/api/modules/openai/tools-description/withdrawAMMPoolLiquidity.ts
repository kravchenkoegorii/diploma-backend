import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const withdrawAMMPoolLiquidity: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'withdrawAMMPoolLiquidity',
    description:
      'Withdraw tokens from AMM liquidity positions.' +
      'Execution requires verbal confirmation.' +
      'If user does not provide all needed data for AMM position withdrawal, you HAVE TO ask him about needed parameters.' +
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
          matchPattern: '^[sv]AMM.*$',
          description:
            'Pool symbol must start with either "sAMM" (stable) or "vAMM" (volatile) prefix (e.g., "sAMM-WETH/USDC", "vAMM-USDC/AERO").' +
            'Cannot be used for Concentrated Liquidity (CL) pools.' +
            'User have to choose the AMM pool for position withdrawal by himself.' +
            'DO NOT make it up yourself.',
        },
        amount: {
          type: 'number',
          require: true,
          description:
            'The amount of LP tokens to withdraw from the position.' +
            'User have to choose the amount of LP tokens for position withdrawal by himself.' +
            'If the user says "50%", "half", "all", "1/3", etc., convert it to the respective decimal (e.g. 0.5) and pass it as-is.' +
            '**Do NOT recalculate this amount manually from token balance. Do NOT infer or guess percentage.**',
        },
        amountType: {
          type: 'string',
          description: 'Type of amount to withdraw',
          enum: ['Percent', 'USD'],
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the withdraw transactions without executing them. `false` value must be set after confirming the withdraw details.',
        },
      },
      required: [
        'chainId',
        'poolSymbol',
        'amount',
        'amountType',
        'isSimulation',
      ],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
