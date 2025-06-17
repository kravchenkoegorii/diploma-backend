import { universalRouterAbi } from 'src/common/constants/chains/abis/universal-router.abi';
import { voterAbi } from 'src/common/constants/chains/abis/voter.abi';
import { swapperDevBaseAbi } from '../../../../../common/constants/chains/abis/swapper/base/swapper-dev.base.abi';
import { erc20Abi, erc721Abi } from 'viem';
import { factoryAbi } from 'src/common/constants/chains/abis/factory.abi';
import { routerAbi } from 'src/common/constants/chains/abis/router.abi';
import { ammPoolAbi } from 'src/common/constants/chains/abis/amm-pool.abi';
import { rewardsAbi } from 'src/common/constants/chains/abis/rewards.abi';
import { minterAbi } from 'src/common/constants/chains/abis/minter.abi';
import { votingAbi } from 'src/common/constants/chains/abis/voting.abi';
import { positionManagerAbi } from 'src/common/constants/chains/abis/position-manager.abi';
import { almAbi } from 'src/common/constants/chains/abis/alm.abi';
import { permit2Abi } from 'src/common/constants/chains/abis/permit2.abi';
import { factoryRegistryAbi } from 'src/common/constants/chains/abis/factory-registry.abi';
import { swapperDevOptimismAbi } from '../../../../../common/constants/chains/abis/swapper/optimism/swapper-dev.optimism.abi';
import { swapperDevUniversalSuperChainAbi } from 'src/common/constants/chains/abis/swapper/univesalSuperChain/swapper-dev.universal-super-chain.abi';

export const getCombinedAbisByChainId = (chainId: number) => {
  // Maybe will be changed
  return [
    voterAbi,
    universalRouterAbi,
    swapperDevBaseAbi,
    swapperDevOptimismAbi,
    swapperDevUniversalSuperChainAbi,
    erc20Abi,
    erc721Abi,
    factoryAbi,
    routerAbi,
    ammPoolAbi,
    rewardsAbi,
    minterAbi,
    votingAbi,
    positionManagerAbi,
    almAbi,
    permit2Abi,
    factoryRegistryAbi,
  ];
};
