import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const vote: TTool = (execute) => ({
  type: 'function',
  function: {
    name: 'vote',
    description:
      'Vote for pools(one or multiple). ' +
      'Execution requires verbal confirmation.' +
      'If user does not provide all needed data for voting for pools, you HAVE TO ask him about needed parameters.' +
      'You are not allowed to start transactions without specifying all function parameters with the user.' +
      'NOTE: If the user selects a pool symbol (e.g., "vAMM-WETH/USDC") — interpret this as a pool selected for voting.\n' +
      'Do NOT attempt to interact with LP positions or call "getPositionsByAddress". Continue voting flow.',
    parameters: {
      type: 'object',
      properties: {
        chainId: {
          type: 'number',
          description: `Chain ID of the token. ${recommendedChains}`,
        },
        lockId: {
          type: 'string',
          description:
            'Lock ID to use for voting.' +
            'User have to choose the lock from the user`s locks list for voting for pools that you show.' +
            'DO NOT make it up yourself.',
        },
        pools: {
          type: 'array',
          description:
            'The list of pools for voting. Each pool is an object with symbol and power.',
          items: {
            type: 'object',
            description: 'The object with symbol and power for voting.',
            properties: {
              symbol: {
                type: 'string',
                matchPattern: '^[sv]AMM.*$|^CL.*$',
                example: 'vAMM-WETH/USDC',
                description:
                  'Pool symbol must start with either "sAMM" (stable),"vAMM" (volatile) or "CL" (concentrated) prefix',
              },
              power: {
                type: 'string',
                example: '50',
                description: 'Voting power in percent.',
              },
            },
            required: ['symbol', 'power'],
            additionalProperties: false,
          },
        },
        isSimulation: {
          type: 'boolean',
          description:
            'If true, the function will simulate the vote transaction without executing it. `false` value must be set after confirming the vote details.',
        },
      },
      required: ['chainId', 'lockId', 'pools', 'isSimulation'],
      additionalProperties: false,
    },
    strict: true,
  },
  execute,
});
