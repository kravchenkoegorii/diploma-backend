import { chainsConfig } from 'src/common/constants/chains';

export const getExceptionAddresses = (chainId: number) => {
  const { voter, votingEscrow } = chainsConfig[chainId];
  return [voter, votingEscrow].map((addr) => addr.toLowerCase());
};
