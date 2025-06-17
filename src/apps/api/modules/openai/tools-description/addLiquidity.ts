import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const addLiquidity: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'addLiquidity',
    description:
      'Add liquidity to the pool. ' +
      'User MUST provide required info, if not, request to provide more details. ' +
      'Call this tool **ONLY** after checking user balances for both tokens of the pool using "getWalletBalanceBySymbol".',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        symbol: {
          type: 'string',
          description: 'Pool`s symbol to add liquidity.',
        },
        tokenIn: {
          type: 'string',
          description: 'Token In symbol to add liquidity to the pool.',
        },
        amount: {
          type: 'number',
          description: 'Number of the Token In to add to the pool.',
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the add liquidity transactions without executing them. `false` value must be set after confirming the swap details.',
        },
      },
      required: ['chainId', 'symbol', 'tokenIn', 'amount', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
