import { BASE_ID } from '../constants/chains/base';
import { OPTIMISM_ID } from '../constants/chains/optimism';

export const chainsScansHelper = (
  chainId: number,
  address: string,
  isToken = false,
) => {
  const type = isToken ? 'token' : 'address';

  switch (chainId) {
    case BASE_ID:
      return `https://basescan.org/${type}/${address}`;
    case OPTIMISM_ID:
      return `https://optimistic.etherscan.io/${type}/${address}`;
    default:
      throw new Error(`Unsupported chain: ${chainId}`);
  }
};
