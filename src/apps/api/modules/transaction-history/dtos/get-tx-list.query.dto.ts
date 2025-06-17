import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class GetTxListQueryDto {
  @ApiProperty({
    description: 'Valid EVM wallet address (0x-prefixed hexadecimal)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'wallet address must be a valid 0x-prefixed Ethereum address',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Transactions limit',
  })
  @IsString()
  limit: string;

  @ApiPropertyOptional({
    description: 'Page number',
  })
  @IsString()
  page: string;

  @ApiPropertyOptional({
    description: 'Chains IDs',
    type: Number,
    isArray: true,
  })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)],
  )
  chains: number[];
}

export class GetTxListForChainDto extends GetTxListQueryDto {
  chainId: number;
}
