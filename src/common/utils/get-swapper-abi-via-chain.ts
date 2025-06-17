import { BASE_ID } from '../constants/chains/base';
import { swapperProdBaseAbi } from '../constants/chains/abis/swapper/base/swapper-prod.base.abi';
import { swapperDevBaseAbi } from '../constants/chains/abis/swapper/base/swapper-dev.base.abi';
import { isProduction } from '../configs/yaml.config';
import { swapperDevOptimismAbi } from '../constants/chains/abis/swapper/optimism/swapper-dev.optimism.abi';
import { swapperProdOptimismAbi } from '../constants/chains/abis/swapper/optimism/swapper-prod.optimism.abi';
import { OPTIMISM_ID } from '../constants/chains/optimism';
import { swapperDevUniversalSuperChainAbi } from '../constants/chains/abis/swapper/univesalSuperChain/swapper-dev.universal-super-chain.abi';

export const getSwapperAbiViaChain = (chainId: number) => {
  switch (chainId) {
    case BASE_ID:
      return isProduction ? swapperProdBaseAbi : swapperDevBaseAbi;
    case OPTIMISM_ID:
      return isProduction ? swapperProdOptimismAbi : swapperDevOptimismAbi;
    default:
      //TODO: replace with proper production ABI
      return isProduction
        ? swapperDevUniversalSuperChainAbi
        : swapperDevUniversalSuperChainAbi;
  }
};
