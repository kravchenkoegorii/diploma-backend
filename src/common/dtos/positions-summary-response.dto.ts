import { ApiProperty } from '@nestjs/swagger';

export class PositionsSummaryResponseDto {
  @ApiProperty()
  staked: number;

  @ApiProperty()
  unstaked: number;

  @ApiProperty()
  totalDepositedCurrent: number;

  @ApiProperty()
  totalDeposited24hAgo: number;

  @ApiProperty()
  stakedReward: number;

  @ApiProperty()
  tradingFee: number;

  @ApiProperty()
  votingReward: number;

  @ApiProperty()
  profits: number;

  @ApiProperty()
  profits24hAgo: number;
}
