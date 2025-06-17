import { LockFilters, LockOperations } from './types';
import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const getLocksByAddress: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'getLockByAddress',
    description:
      'Returns all locks for a given address using the primary wallet address.' +
      'Permanent locks are always considered active and should not be counted as expired.' +
      'Always use this method in the voting for pools flow instead of "getPositionsByAddress"',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the network. Recommended chains: ${recommendedChains}`,
        },
        address: {
          type: 'string',
          description: "User's wallet address.",
        },
        type: {
          type: 'string',
          description: `Specifies the operation type for filtering locks based on the intended action. 
          Possible values (from LockOperations enum):
            - Extend: For extending the duration of a lock.
            - Merge: For merging two locks.
            - Increase: For increasing the amount of locked tokens.
            - Withdraw: For withdrawing tokens from a lock.
            - SetToRelay: For assigning a lock to a relay strategy.
            - ClaimLockRewards: For claiming or rebasing lock rewards.
            - Transfer: For transferring a lock.
            - Default (or 'null'): When no specific operation is targeted.`,
          enum: Object.values(LockOperations),
          default: LockOperations.Default,
        },
        filterLocks: {
          type: 'array',
          description: `An array of filters to further refine lock retrieval based on lock status. 
          Possible values (from LockFilters enum):
            - Expired: Selects locks that have expired. (use 'Expired' for withdraw locks)
            - Active: Selects locks that are currently active.
            - WithoutVotes: Selects locks that have no votes assigned. Always use it in voting for pools.
            - Default (or 'null'): No additional filtering.`,
          items: {
            type: 'string',
            enum: Object.values(LockFilters),
          },
        },
      },
      required: ['address', 'chainId', 'type', 'filterLocks'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
