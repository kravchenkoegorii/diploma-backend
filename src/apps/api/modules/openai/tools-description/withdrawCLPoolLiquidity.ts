import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const withdrawCLPoolLiquidity: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'withdrawCLPoolLiquidity',
    description:
      'Withdraw tokens from Concentrated Liquidity (CL) liquidity positions.' +
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
          matchPattern: '^(CL).*$',
          description:
            'Pool symbol must contain either "CL" prefix (e.g., "CL100-WETH/USDC").' +
            'Cannot be used for AMM pools.' +
            'User have to choose the CL pool for position withdrawal by himself.' +
            'DO NOT make it up yourself.',
        },
        positionId: {
          type: 'string',
          description: 'Position ID of the liquidity position',
        },
        amount: {
          type: 'number',
          require: true,
          description:
            'The amount of LP tokens to withdraw from the position.' +
            'User have to choose the amount of LP tokens for position withdrawal by himself.' +
            'If the user provides percentage or fraction (like “50%”, “1/2”, “half”), convert that to decimal (e.g. 0.5) and pass directly.' +
            '**Do NOT calculate or override the value based on internal logic or balances.**',
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
        'positionId',
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
