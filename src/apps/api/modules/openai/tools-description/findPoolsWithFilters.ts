import { TTool } from '../types';
import { recommendedChains } from './constants.ts';

export const findPoolsWithFilters: TTool = (execute, toString) => ({
  type: 'function',
  function: {
    name: 'findPoolsWithFilters',
    description: 'Retrieve LP pools data with filtering and sorting options',
    parameters: {
      type: 'object',
      properties: {
        chains: {
          type: 'array',
          description: 'List of the chains to get pools with filters',
          items: {
            type: 'string',
            description: `Chains IDs. ${recommendedChains}`,
          },
        },
        orderBy: {
          type: 'string',
          description: `
            Sort pools by a specific field. reserve0 and reserve1 is same as balance.
            Specialty:
           - For "most rewarded/least rewarded (for voting)" request by default use "vApr" field.
           - Default order by field for all other requests is "tvl"
            `,
          enum: [
            'liquidity',
            'type',
            'tick',
            'tvl',
            'apr',
            'volume',
            'reserve0',
            'reserve1',
            'staked0',
            'staked1',
            'pool_fee',
            'votes',
            'vApr',
            'reserveInUsd0',
            'reserveInUsd1',
            'dailyEmissionUsd',
            'totalFeesInUSD',
          ],
        },
        sortOrder: {
          type: 'string',
          description: 'Sort order, either ascending or descending',
          enum: ['asc', 'desc'],
        },
        filters: {
          type: 'object',
          description:
            'Filter pools by specific properties. Any field in PoolData can be used.',
          properties: {
            lp: { type: 'string', description: 'Pool contract address' },
            symbol: {
              type: 'string',
              description: 'Pool symbol, name or token0/token1 pair',
            },
            decimals: { type: 'number', description: 'Pool decimals' },
            liquidity: { type: 'string', description: 'Pool liquidity supply' },
            typeByStability: {
              type: 'string',
              description:
                "Pool's stability type. Never ignore the following keywords: stable, volatile",
              enum: ['stable', 'volatile'],
            },
            type: {
              type: 'string',
              description:
                'Pool"s type. Never ignore the following keywords: basic, concentrated',
              enum: ['basic', 'concentrated'],
            },
            tick: {
              type: 'number',
              description: 'Current tick (for CL pools)',
            },
            sqrt_ratio: { type: 'string', description: 'Pool sqrt ratio X96' },
            token0: {
              type: 'string',
              description:
                'First token address (0x-prefixed hexadecimal string)',
              pattern: '^0x[a-fA-F0-9]{42}$',
            },
            reserve0: { type: 'string', description: 'First token reserve' },
            staked0: {
              type: 'string',
              description: 'First token staked amount',
            },
            token1: {
              type: 'string',
              description:
                'Second token address (0x-prefixed hexadecimal string)',
              pattern: '^0x[a-fA-F0-9]{42}$',
            },
            reserve1: { type: 'string', description: 'Second token reserve' },
            staked1: {
              type: 'string',
              description: 'Second token staked amount',
            },
            gauge_alive: {
              type: 'boolean',
              description: 'Whether the pool gauge is active',
            },
            pool_fee: {
              type: 'number',
              description: 'Pool swap fee percentage',
            },
            apr: { type: 'number', description: 'Annual Percentage Rate' },
            min_tvl: {
              type: 'number',
              description: `
                Minimum Total Value Locked. 
                Special cases:
                -For "most/least rewarded pools (for voting)" request use "null" by default;
                -For all others request default value is 500 .
                 `,
            },
            max_tvl: {
              type: 'number',
              description: 'Maximum Total Value Locked',
            },
            mostRewarded: {
              type: 'boolean',
              description: `
                  "Most rewarded pools (for voting)". If true totalRewardInUsd > 300$.
                  Use "true" it if the user literally asks you to show the pools with the biggest rewards 
                  Use "false" it if the user literally asks you to show the pools with the lowest rewards 
                 `,
            },
            volume: { type: 'number', description: 'Trading volume' },
            isExotic: {
              type: 'boolean',
              description: 'Whether the user wants exotic pools',
            },
          },
          additionalProperties: false,
          required: ['min_apr'],
        },
        limit: {
          type: 'number',
          description:
            'Number of pools in the result. Value is not more than 10',
        },
      },
      required: ['chains', 'orderBy', 'sortOrder', 'filters', 'limit'],
      additionalProperties: false,
    },
  },
  execute,
  toString,
});
