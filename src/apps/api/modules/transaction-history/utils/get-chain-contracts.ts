import { chainsConfig } from 'src/common/constants/chains';

export const getChainContracts = (chainId: number) => {
  const { votingEscrow } = chainsConfig[chainId];
  return { ESCROW: votingEscrow };
};
