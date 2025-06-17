import { TokenResponse } from '../../../../../common/types';
import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Address } from 'viem';

export class AssetDto
  implements Pick<TokenResponse, 'symbol' | 'price' | 'token_address'>
{
  @Expose()
  @ApiProperty()
  token_address: Address;

  @Expose()
  @ApiProperty()
  symbol: string;

  @Expose()
  @ApiProperty()
  price?: string;

  @Expose()
  @ApiProperty()
  tokenLogo: string;

  @Expose()
  @ApiProperty()
  tokenName: string;

  @Expose()
  @ApiProperty()
  allocationPercent: number;

  @Expose()
  @ApiProperty()
  amount: string;

  @Expose()
  @ApiProperty()
  amountUSD: number;

  @Expose()
  @ApiProperty()
  decimals: number;
}
