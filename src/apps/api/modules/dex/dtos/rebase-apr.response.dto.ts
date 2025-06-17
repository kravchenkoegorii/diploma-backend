import { ApiProperty } from '@nestjs/swagger';
import { IRebaseAprData } from '../../../../../common/types';

export class RebaseAprDto {
  @ApiProperty()
  chainId: number;

  @ApiProperty()
  rebaseApr: number;

  constructor(data: IRebaseAprData) {
    this.chainId = data.chainId;
    this.rebaseApr = +data.rebaseApr;
  }
}

export class RebaseAprResponseDto {
  @ApiProperty({ type: [RebaseAprDto] })
  rebaseAprs: RebaseAprDto[];
}
