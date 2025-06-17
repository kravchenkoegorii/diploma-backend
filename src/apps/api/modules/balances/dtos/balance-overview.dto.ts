import { ApiProperty } from '@nestjs/swagger';
import { AssetDto } from './asset.dto';

export class AssetOverviewDto extends AssetDto {
  @ApiProperty()
  pnl: number;
}

export class BalanceOverviewDto {
  @ApiProperty()
  currentBalance: number;

  @ApiProperty({ type: AssetOverviewDto, isArray: true })
  assets: AssetOverviewDto[];

  @ApiProperty()
  previousBalance: number;
}

export class BalanceOverviewResponseDto extends BalanceOverviewDto {
  @ApiProperty()
  tokenQty: number;
}
