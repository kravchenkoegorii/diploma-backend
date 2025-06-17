import { Scalars } from '@de-fi/sdk';

export interface DeFiPagination<T> {
  items: T[];
  limit: number;
  page: number;
  pages: number;
  promotedTokens: number;
  total: number;
}

export interface DeFiToken {
  id: string;
  name: string;
  symbol: string;
  current_price: number;
  market_cap_rank: number;
  spark_line: string;
  market_cap: number;
  total_volume: number;
  price_change_percentage_1h_in_currency: number;
  price_change_percentage_24h_in_currency: number;
  price_change_percentage_7d_in_currency: number;
  trending_score: number | null;
  is_meme: boolean | null;
}

export interface DeFiBalance {
  asset: {
    address: Scalars['String'];
    name?: Scalars['String'];
    displayName?: Scalars['String'];
    symbol?: Scalars['String'];
    decimals?: Scalars['Float'];
    price?: Scalars['Float'];
  };
  balance: Scalars['Float'];
}

export interface DeFiBalanceExtended extends DeFiBalance {
  usdValue: number;
}

export type DeFiBalances = DeFiBalance[];

export interface IDeFiTokenPageInfo {
  id: string;
  name: string;
  image: string;
  symbol: string;
  current_price: number;
  market_cap_rank: number;
  spark_line: string;
  market_cap: number;
  total_volume: number;
  price_change_percentage_1h_in_currency: number;
  price_change_percentage_24h_in_currency: number;
  price_change_percentage_7d_in_currency: number;
  trending_score?: any;
  isFavorite: boolean;
}

export interface ITokenBalance {
  balances: DeFiBalances;
  chainId: number;
}
