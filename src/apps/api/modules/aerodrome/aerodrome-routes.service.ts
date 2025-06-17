import { Injectable, Logger } from '@nestjs/common';
import { MultiGraph } from 'graphology';
import { allSimpleEdgeGroupPaths } from 'graphology-simple-path';
import { Address, encodePacked, getContract } from 'viem';
import { base } from 'viem/chains';
import { PoolData } from '../../../../common/types';
import { CacheService } from '../cache/cache.service';
import { getPoolsDataKey } from '../cache/constants/keys';
import { mixedQuoterAbi } from '../../../../common/constants/chains/abis/mixed-quoter.abi';
import { BASE_MIXED_QUOTER } from '../../../../common/constants/chains/base/base.contracts';
import { ViemService } from '../viem/viem.service';

@Injectable()
export class AerodromeRoutesService {
  public static readonly VOLATILE_SPACE = 4194304;
  public static readonly STABLE_SPACE = 2097152;
  private readonly logger = new Logger(AerodromeRoutesService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
  ) {}

  async findShortestSwapRoute(
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    amountInBn: bigint,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const pools = await this.cacheService.get<PoolData[]>(
      getPoolsDataKey(chainId),
    );

    if (!pools) {
      throw new Error(`Pools not found in the cache for chain ${chainId}`);
    }

    const graph = new MultiGraph({ multi: true });
    const poolsForSwaps = pools.filter((p) => +(p.tvl ?? 0) > 500);

    for (let i = 0; i < poolsForSwaps.length; i++) {
      const pool = poolsForSwaps[i];
      const lp = pool.lp.toLowerCase();
      const token0 = poolsForSwaps[i].token0.toLowerCase();
      const token1 = poolsForSwaps[i].token1.toLowerCase();
      graph.mergeEdgeWithKey(`direct:${lp}`, token0, token1);
      graph.mergeEdgeWithKey(`reversed:${lp}`, token1, token0);
    }

    let paths: string[][][] = [];
    try {
      paths = allSimpleEdgeGroupPaths(
        graph,
        tokenIn.toLowerCase(),
        tokenOut.toLowerCase(),
        { maxDepth: 3 },
      );
    } catch {
      paths = [];
    }

    const validPaths: any[] = [];

    paths.forEach((path) => {
      let pathCombinations: any[] = [];

      path.forEach((edgeGroup, depth) => {
        const newCombinations: any[] = [];

        edgeGroup.forEach((edge) => {
          const [direction, poolId] = edge.split(':');
          const pool = poolsForSwaps.find((p) => p.lp.toLowerCase() === poolId);

          if (!pool) {
            throw new Error('Pool not found');
          }

          const pathInfo = {
            from: pool.token0,
            to: pool.token1,
            type: pool.type,
            lp: pool.lp,
            factory: pool.factory,
            pool_fee: pool.pool_fee,
          };

          if (direction === 'reversed') {
            [pathInfo.from, pathInfo.to] = [pathInfo.to, pathInfo.from];
          }

          if (depth === 0) {
            newCombinations.push([pathInfo]);
          } else {
            pathCombinations.forEach((existingPath) => {
              newCombinations.push([...existingPath, pathInfo]);
            });
          }
        });

        pathCombinations = newCombinations;
      });

      validPaths.push(...pathCombinations);
    });

    const nodes = validPaths.map((path) => ({ nodes: path }));
    let bestPath: any[] = [];
    let bestPathQuote = BigInt(0);
    let routesWithPools: {
      from: Address;
      to: Address;
      type: number;
      lp: Address;
    }[] = [];

    // Init router contract
    const mixedQuoterContract = getContract({
      address: BASE_MIXED_QUOTER,
      abi: mixedQuoterAbi,
      client: viemClient,
    });

    for (let i = 0; i < nodes.length && i < 25; i++) {
      const node = nodes[i].nodes;
      const path: any[] = [];

      for (let j = 0; j < node.length; j++) {
        const pool = node[j];

        if (j === 0) {
          path.push(pool.from);
        }
        if (pool.type === -1) {
          path.push(AerodromeRoutesService.VOLATILE_SPACE);
        } else if (pool.type === 0) {
          path.push(AerodromeRoutesService.STABLE_SPACE);
        } else {
          path.push(+(pool?.type ?? 0));
        }
        path.push(pool.to);
      }

      const swapPath = this.encodePath(path);

      try {
        const { result } = await mixedQuoterContract.simulate.quoteExactInput(
          [swapPath, amountInBn],
          {
            chain: base,
          },
        );

        const quote = result[0];

        if (quote > bestPathQuote) {
          bestPathQuote = quote;
          bestPath = path;
          routesWithPools = node;
        }
      } catch (e) {
        this.logger.error('Error quoting path');
      }
    }

    return { bestPath, bestPathQuote, routesWithPools };
  }

  encodePath(segments: (Address | number)[]) {
    return encodePacked(
      segments.map((segment) =>
        typeof segment === 'string' ? 'address' : 'int24',
      ),
      segments,
    );
  }

  buildV3SwapPath(
    nodes: {
      from: Address;
      to: Address;
      type: number;
      lp: Address;
    }[],
  ) {
    const { types, values } = this.getPathTypesAndValues(nodes);
    return encodePacked(types, values);
  }

  private getPathTypesAndValues(
    nodes: {
      from: Address;
      to: Address;
      type: number;
      lp: Address;
    }[],
  ) {
    return {
      types: [
        ...Array(nodes.length).fill(['address', 'int24']).flat(), // Each node has an address and a fee tier.
        'address', // Final token address.
      ],
      values: nodes.reduce((accumulated, node) => {
        let feeTier =
          Number(node.type) === 0
            ? AerodromeRoutesService.STABLE_SPACE
            : AerodromeRoutesService.VOLATILE_SPACE; // Choose fee based on type.
        if (Number(node.type) > 0) feeTier = Number(node.type); // Custom fee for V3.

        // Build the path: [fromAddress, feeTier, toAddress].
        return accumulated.length === 0
          ? [node.from, feeTier, node.to]
          : [...accumulated, feeTier, node.to];
      }, []),
    };
  }
}
