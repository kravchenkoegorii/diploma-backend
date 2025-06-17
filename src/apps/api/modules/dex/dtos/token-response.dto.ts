import { Address } from 'viem';
import { IToken } from '../../../../../common/types/token';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TokenResponse } from '../../../../../common/types';

export class TokenResponseDto implements Omit<IToken, 'account_balance'> {
  @ApiProperty({ type: String })
  token_address: Address;

  @ApiProperty()
  symbol: string;

  @ApiProperty()
  decimals: number;

  @ApiProperty()
  account_balance: string;

  @ApiProperty()
  listed: boolean;

  @ApiProperty()
  chainId: number;

  @ApiPropertyOptional()
  scan_url?: string;

  @ApiPropertyOptional()
  price?: string;

  constructor(data: Partial<TokenResponse>) {
    Object.assign(this, data);
  }
}
