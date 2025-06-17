import { yamlConfig } from 'src/common/configs/yaml.config';
import { chainsConfig } from 'src/common/constants/chains';
import { base } from 'viem/chains';

export const getManagersByChainId = (chainId: number) => {
  const { votingEscrow, factoryContract, universalRouter, voter } =
    chainsConfig[chainId];
  const swapperContract = yamlConfig.SWAPPER_CONTRACTS[chainId].toLowerCase();

  const generalManagers = [
    universalRouter,
    factoryContract,
    votingEscrow,
    swapperContract,
    voter,
  ];

  switch (chainId) {
    case base.id:
      return [
        '0x37785d5bE19D0d9559D4634a5385c72c419b25Da',
        '0x827922686190790b37229fd06084350e74485b72',
        ...generalManagers,
      ].map((hash) => hash.toLowerCase());

    default:
      return generalManagers.map((hash) => hash.toLowerCase());
  }
};
