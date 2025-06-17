import { sugarAbi } from 'src/common/constants/chains/abis/sugar.abi';
import { ReadContractReturnType } from 'viem';

export type TToken = ReadContractReturnType<typeof sugarAbi, 'tokens'>[0];

export interface IToken extends TToken {
  price?: string;
  market_cap?: number;
  volume_24h?: number;
  is_meme?: boolean;
  name?: string;
  chainId?: number;
  scan_url?: string;
}
