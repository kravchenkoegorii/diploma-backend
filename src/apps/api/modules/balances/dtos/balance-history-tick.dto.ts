import { ApiProperty } from '@nestjs/swagger';

export class BalanceHistoryTickDto {
  @ApiProperty({
    description: 'Timestamp of the interval',
  })
  date: number;

  @ApiProperty({
    description: 'User total balance in USD at the given time',
  })
  totalBalanceUsd: number;
}
