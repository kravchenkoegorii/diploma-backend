import { ReadContractReturnType } from 'viem';
import { sugarRelaysAbi } from '../constants/chains/abis/sugar-relays.abi';

export type TRelay = ReadContractReturnType<typeof sugarRelaysAbi, 'all'>[0];

export interface IRelay extends TRelay {
  chainId: number;
  token_symbol: string;
  apr: number;
  amount_formatted: string;
}
