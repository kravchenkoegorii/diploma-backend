import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
} from 'class-validator';
import { Address } from 'viem';
import { Transform } from 'class-transformer';

export class GetBalanceOverviewQueryDto {
  @ApiProperty({
    description: 'Valid EVM wallet address (0x-prefixed hexadecimal)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'wallet address must be a valid 0x-prefixed Ethereum address',
  })
  walletAddress: Address;

  @ApiProperty({
    description: 'Chains IDs',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value.map(Number) : [Number(value)],
  )
  chains: number[];
}
