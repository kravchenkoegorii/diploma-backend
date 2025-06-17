import { TTool } from '../types';
import { recommendedChains } from './constants.ts';
import { ActionType } from './types';

export const getPositionsByAddress: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getPositionsByAddress',
    description: `Returns all positions for a given address. 
    If no address is provided, the primary wallet address will be used.
    **NEVER** use this tool for voting. Voting uses locks, not positions. Use 'getLocksByAddress' with filter ['WithoutVotes'].
    `,
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        type: {
          type: 'string',
          enum: Object.values(ActionType),
          description: `The type of positions for specific action 
             enum ActionType {
              Stake = 'stake',
              Unstake = 'unstake',
              ClaimFee = 'claimFee',
              ClaimEmission = 'claimEmission',
              ClaimAllRewards = 'claimAllRewards',
              Withdraw = 'withdraw',
              Default = 'null',
            }
            `,
          optional: true,
          default: null,
        },
      },
      required: ['chainId'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
