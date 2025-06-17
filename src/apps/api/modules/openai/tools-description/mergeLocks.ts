import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const mergeLocks: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'mergeLocks',
    description: `Merges multiple locked AERO tokens into a single lock. 
      Execution requires user confirmation.
      Needs define "from" and  "to" roles. Get approvement from user to use locks roles.
      `,
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        fromLockId: {
          type: 'string',
          description: `
          Lock Id to merge [from]:
          - Merging 'from' (FROM ONLY) lock with  permanent mode are not allowed (lockList[i].permanent === true)
          - Merging 'from' (FROM ONLY) lock with  active voted on  this epoch are not allowed( lockList[i].votes.length > 0)
          `,
        },
        toLockId: {
          type: 'string',
          description: `
          Lock Id to merge [to]:
          -"to" lock cant be expired
          `,
        },
        isSimulation: {
          type: 'boolean',
          description: `
            If "true", the function will simulate the merge transaction without executing it. 
            "false" must be set after confirming the merge details.
            `,
        },
        token: {
          type: 'string',
          enum: ['AERO', 'VELO'],
          description: 'The tokens symbol. Token supported : AERO, VELO',
          default: 'AERO',
        },
      },
      required: ['chainId', 'fromLockId', 'toLockId', 'isSimulation', 'token'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
  toString,
});
