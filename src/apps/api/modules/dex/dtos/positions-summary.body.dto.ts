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

export class PositionsSummaryBodyDto {
  @ApiProperty({
    description: 'Valid EVM wallet address (0x-prefixed hexadecimal)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'walletAddress must be a valid 0x-prefixed Ethereum address',
  })
  walletAddress: Address;

  @ApiProperty({
    description: 'Chains IDs',
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  chains: number[];
}
