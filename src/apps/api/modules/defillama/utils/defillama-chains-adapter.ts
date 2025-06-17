import { base, optimism } from 'viem/chains';

const defiLlamachains: Record<number, string> = {
  [base.id]: 'base',
  [optimism.id]: 'optimism',
};

export const defillamaChainsAdapter = (chainId: number) =>
  defiLlamachains[chainId];
