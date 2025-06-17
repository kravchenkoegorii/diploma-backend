interface Decodedinput {
  method_call: string;
  method_id: string;
  parameters: Parameter[];
}

interface Parameter {
  name: string;
  type: string;
  value: (any[] | string)[] | string;
}

interface Fee {
  type: string;
  value: string;
}

interface To {
  ens_domain_name?: any;
  hash: string;
  implementations: any[];
  is_contract: boolean;
  is_scam: boolean;
  is_verified: boolean;
  metadata?: any;
  name: string;
  private_tags: any[];
  proxy_type?: any;
  public_tags: any[];
  watchlist_names: any[];
}

interface From {
  ens_domain_name?: any;
  hash: string;
  implementations: any[];
  is_contract: boolean;
  is_scam: boolean;
  is_verified: boolean;
  metadata?: any;
  name?: any;
  private_tags: any[];
  proxy_type?: any;
  public_tags: any[];
  watchlist_names: any[];
}

export interface IBlockscoutTransaction {
  priority_fee: string;
  tx_burnt_fee: string;
  raw_input: string;
  result: string;
  hash: string;
  max_fee_per_gas: string;
  revert_reason?: any;
  confirmation_duration: number[];
  type: number;
  token_transfers_overflow?: any;
  confirmations: number;
  position: number;
  max_priority_fee_per_gas: string;
  transaction_tag?: any;
  created_contract?: any;
  value: string;
  tx_types: string[];
  from: From;
  gas_used: string;
  status: string;
  to: To;
  authorization_list: any[];
  method: string;
  fee: Fee;
  tx_tag?: any;
  actions: any[];
  gas_limit: string;
  gas_price: string;
  decoded_input: Decodedinput;
  has_error_in_internal_txs: boolean;
  token_transfers?: any;
  base_fee_per_gas: string;
  timestamp: string;
  nonce: number;
  block: number;
  transaction_types: string[];
  exchange_rate?: any;
  block_number: number;
  has_error_in_internal_transactions: boolean;
}

interface Nextpageparams {
  block_number: number;
  fee: string;
  hash: string;
  index: number;
  inserted_at: string;
  items_count: number;
  value: string;
}

export interface IBlockscoutTransactionResponce {
  items: IBlockscoutTransaction[];
  next_page_params: Nextpageparams;
}
