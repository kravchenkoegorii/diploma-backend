import { Address } from 'viem';

export interface IBlockscoutAsset {
  token: IBlockscoutTokenInfo;
  token_id?: any;
  token_instance?: any;
  value: string;
}

export interface IBlockscoutTokenInfo {
  address: Address;
  circulating_market_cap?: any;
  decimals: string;
  exchange_rate?: any;
  holders: string;
  icon_url?: any;
  name: string;
  symbol: string;
  total_supply: string;
  type: string;
  volume_24h?: any;
}
