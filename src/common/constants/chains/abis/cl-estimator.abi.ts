export const clEstimatorAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
      { internalType: 'address', name: 'pool', type: 'address' },
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
      { internalType: 'int24', name: 'tickLow', type: 'int24' },
      { internalType: 'int24', name: 'tickHigh', type: 'int24' },
    ],
    name: 'estimateAmount0',
    outputs: [{ internalType: 'uint256', name: 'amount0', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'address', name: 'pool', type: 'address' },
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
      { internalType: 'int24', name: 'tickLow', type: 'int24' },
      { internalType: 'int24', name: 'tickHigh', type: 'int24' },
    ],
    name: 'estimateAmount1',
    outputs: [{ internalType: 'uint256', name: 'amount1', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract INonfungiblePositionManager',
        name: 'positionManager',
        type: 'address',
      },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
    ],
    name: 'fees',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'bool', name: 'roundUp', type: 'bool' },
    ],
    name: 'getAmount0Delta',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
      { internalType: 'int128', name: 'liquidity', type: 'int128' },
    ],
    name: 'getAmount0Delta',
    outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
      { internalType: 'int128', name: 'liquidity', type: 'int128' },
    ],
    name: 'getAmount1Delta',
    outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'bool', name: 'roundUp', type: 'bool' },
    ],
    name: 'getAmount1Delta',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
    ],
    name: 'getAmountsForLiquidity',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioAX96', type: 'uint160' },
      { internalType: 'uint160', name: 'sqrtRatioBX96', type: 'uint160' },
    ],
    name: 'getLiquidityForAmounts',
    outputs: [{ internalType: 'uint256', name: 'liquidity', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'pool', type: 'address' },
      { internalType: 'int24', name: 'startTick', type: 'int24' },
    ],
    name: 'getPopulatedTicks',
    outputs: [
      {
        components: [
          { internalType: 'int24', name: 'tick', type: 'int24' },
          { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
          { internalType: 'int128', name: 'liquidityNet', type: 'int128' },
          { internalType: 'uint128', name: 'liquidityGross', type: 'uint128' },
        ],
        internalType: 'struct ISugarHelper.PopulatedTick[]',
        name: 'populatedTicks',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'int24', name: 'tick', type: 'int24' }],
    name: 'getSqrtRatioAtTick',
    outputs: [
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
    ],
    name: 'getTickAtSqrtRatio',
    outputs: [{ internalType: 'int24', name: 'tick', type: 'int24' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'pool', type: 'address' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'int24', name: 'tickCurrent', type: 'int24' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
    ],
    name: 'poolFees',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract INonfungiblePositionManager',
        name: 'positionManager',
        type: 'address',
      },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtRatioX96', type: 'uint160' },
    ],
    name: 'principal',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
