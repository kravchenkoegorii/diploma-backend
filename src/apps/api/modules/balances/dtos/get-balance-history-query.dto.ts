import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNumber,
  IsString,
  Matches,
} from 'class-validator';
import { BalanceHistoryInterval } from 'src/common/enums/balance-history-interval.enum';
import { Transform } from 'class-transformer';

export class GetBalanceHistoryQueryDto {
  @ApiProperty({
    description: 'Valid EVM wallet address (0x-prefixed hexadecimal)',
  })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'wallet address must be a valid 0x-prefixed Ethereum address',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Interval for balance history',
    enum: BalanceHistoryInterval,
  })
  @IsEnum(BalanceHistoryInterval)
  interval: BalanceHistoryInterval;

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
