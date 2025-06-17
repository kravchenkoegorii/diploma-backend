import { base, optimism } from 'viem/chains';
import { Chain } from 'viem';

export const VIEM_RPC_URLS: Record<number, string[]> = {
  [base.id]: [
    'https://base-mainnet.g.alchemy.com/v2/_a_Lk2SinMGFNykmAKa1RrJHzjBnVr7l',
    'https://mainnet.base.org',
    'https://base.meowrpc.com',
    'https://base-rpc.publicnode.com',
    'https://base.drpc.org',
    'https://base.gateway.tenderly.co',
    'https://base-mainnet.public.blastapi.io',
    'https://base-pokt.nodies.app',
    'https://base.blockpi.network/v1/rpc/public',
    'https://endpoints.omniatech.io/v1/base/mainnet/public',
    'https://base.lava.build',
    'https://base.api.onfinality.io/public',
    'https://base.rpc.subquery.network/public',
    'https://1rpc.io/base',
    'https://developer-access-mainnet.base.org',
  ],
  [optimism.id]: [
    'https://opt-mainnet.g.alchemy.com/v2/_a_Lk2SinMGFNykmAKa1RrJHzjBnVr7l',
    'https://optimism.meowrpc.com',
    'https://0xrpc.io/op',
    'https://op-pokt.nodies.app',
    'https://optimism.drpc.org',
    'https://rpc.ankr.com/optimism',
    'https://optimism.gateway.tenderly.co',
    'https://optimism-rpc.publicnode.com',
    'https://mainnet.optimism.io',
    'https://gateway.tenderly.co/public/optimism',
    'https://optimism-mainnet.public.blastapi.io',
    'https://optimism.blockpi.network/v1/rpc/public',
    'https://1rpc.io/op',
    'https://optimism.rpc.subquery.network/public',
  ],
};

export const MAP_CHAIN_ID_CHAIN: Record<number, Chain> = {
  [base.id]: base,
  [optimism.id]: optimism,
};
