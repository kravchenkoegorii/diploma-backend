import { base, optimism } from 'viem/chains';

const dexScreenerNetworksByChainId: Record<number, string> = {
  [base.id]: 'base',
  [optimism.id]: 'optimism',
};

export const getGexScreenChain = (chainId: number) =>
  dexScreenerNetworksByChainId[chainId];
