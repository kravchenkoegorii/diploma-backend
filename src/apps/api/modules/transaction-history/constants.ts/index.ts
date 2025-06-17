import { Network } from 'alchemy-sdk';
import { base, optimism } from 'viem/chains';

export const ALCHEMY_CHAINS_ID_MAP: number[] = [base.id, optimism.id];

export const ALCHEMY_NETWORKS: Record<number, Network> = {
  [base.id]: Network.BASE_MAINNET,
  [optimism.id]: Network.OPT_MAINNET,
};

export const MAX_TX_ELEMENTS = 50;
