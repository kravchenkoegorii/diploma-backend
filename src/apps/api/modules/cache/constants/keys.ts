import { BlockTag } from 'viem';

export const getResponceTokenInfoKey = (token: string, chainId: number) =>
  `token_info_res:${token}_${chainId}`;

export const getDeFiBalancesKey = (walletAddress: string, chainId: number) =>
  `defi_balances:${walletAddress}_${chainId}`;

export const getDeFiTokenPageInfoKey = (symbol: string, chainId: number) =>
  `defi_token_page_info:${symbol}_${chainId}`;

export const getTokenInfoDexScreenerKey = (token: string, chainId: number) =>
  `dex_screener_token_info:${token}_chainId ${chainId}`;

export const getPoolsDataKey = (chainId: number) => `pools_data:${chainId}`;

export const getAllPoolsDataKey = (chainId: number) =>
  `all_pools_data:${chainId}`;

export const getTokenInfoKey = (chainId: number) => `token_info:${chainId}`;

export const getRelaysKey = (chainId: number) => `relays:${chainId}`;

export const getEpochsLatestKey = (chainId: number) =>
  `epochs_latest:${chainId}`;

export const getPositionsKey = (
  address: string,
  blockNumber: bigint | BlockTag = 'latest',
  chainId: number,
) => `positions:${address}_${chainId}_${blockNumber}`;

export const getVotingRewardsKey = (address: string, chainId: number) =>
  `voting_rewards:${address}_${chainId}`;

export const getLlamaTokenPrice = (
  address: string,
  timestamp: string,
  chainId: number,
) => `llama_token_price:_chainId:${chainId}_${address}_${timestamp}`;

export const getDeFiTokensKey = () => 'defi_tokens';

export const getUserTransactionsKeyByChainId = (
  wallet: string,
  chainId: number,
) => `transactions_history:${wallet.toLowerCase()}&chainId:${chainId}`;
