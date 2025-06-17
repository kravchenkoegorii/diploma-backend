import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AssetDto } from './asset.dto';

export class GetTokenBalancesResponseDto {
  @Expose()
  @Type(() => AssetDto)
  @ApiProperty({
    type: AssetDto,
    isArray: true,
  })
  assets: AssetDto[];

  @Expose()
  totalBalanceUsd: number;
}
