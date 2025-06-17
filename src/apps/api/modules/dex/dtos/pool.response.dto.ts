import { ApiProperty } from '@nestjs/swagger';
import { PoolData } from 'src/common/types';
import { Address } from 'viem';

export class PoolResponseDto
  implements Omit<PoolData, 'votes' | 'bribes' | 'fees'>
{
  @ApiProperty()
  lp: Address;
  @ApiProperty()
  symbol: string;
  @ApiProperty()
  decimals: number;
  @ApiProperty()
  liquidity: string;
  @ApiProperty()
  type: number;
  @ApiProperty()
  tick: number;
  @ApiProperty()
  sqrt_ratio: string;
  @ApiProperty()
  token0: Address;
  @ApiProperty()
  reserve0: string;
  @ApiProperty()
  staked0: string;
  @ApiProperty()
  token1: Address;
  @ApiProperty()
  reserve1: string;
  @ApiProperty()
  staked1: string;
  @ApiProperty()
  gauge: Address;
  @ApiProperty()
  gauge_liquidity: string;
  @ApiProperty()
  gauge_alive: boolean;
  @ApiProperty()
  fee: string;
  @ApiProperty()
  bribe: string;
  @ApiProperty()
  factory: Address;
  @ApiProperty()
  emissions: string;
  @ApiProperty()
  emissions_token: string;
  @ApiProperty()
  pool_fee: number;
  @ApiProperty()
  unstaked_fee: number;
  @ApiProperty()
  token0_fees: string;
  @ApiProperty()
  token1_fees: string;
  @ApiProperty()
  nfpm: string;
  @ApiProperty()
  alm: Address;
  @ApiProperty()
  root: string;
  @ApiProperty()
  chainId: number;
  @ApiProperty({ nullable: true })
  tokenPrice0?: string | undefined;
  @ApiProperty({ nullable: true })
  tokenPrice1?: string | undefined;
  @ApiProperty({ nullable: true })
  reserveInUsd0?: string | undefined;
  @ApiProperty({ nullable: true })
  reserveInUsd1?: string | undefined;
  @ApiProperty({ nullable: true })
  stakedInUsd0?: string | undefined;
  @ApiProperty({ nullable: true })
  stakedInUsd1?: string | undefined;
  @ApiProperty({ nullable: true })
  tvl?: string | undefined;
  @ApiProperty({ nullable: true })
  apr?: string | undefined;
  @ApiProperty({ nullable: true })
  volume?: string | undefined;
  @ApiProperty({ nullable: true })
  dailyEmissionUsd?: string | undefined;
  @ApiProperty({ nullable: true })
  rebateApr?: string | undefined;

  constructor(data: Partial<PoolData>) {
    Object.assign(this, data);
  }
}
