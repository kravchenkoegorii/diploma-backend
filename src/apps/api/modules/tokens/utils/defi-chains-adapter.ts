const defiChains: Record<number, number> = {
  8453: 49,
  10: 17,
};

export const defiChainsAdapter = (chainId: number) => {
  return defiChains[chainId];
};
