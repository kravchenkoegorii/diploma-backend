import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UseBearerTokenAuthGuard } from '../auth/guards/auth.guard';
import { PoolResponseDto } from './dtos/pool.response.dto';
import { GetPoolsBodyDto } from './dtos/get-pools.body.dto';
import { TokenResponseDto } from './dtos/token-response.dto';
import { PositionsSummaryResponseDto } from '../../../../common/dtos/positions-summary-response.dto';
import { PositionsSummaryBodyDto } from './dtos/positions-summary.body.dto';
import { DexService } from './dex.service';
import { ChainsQueryDto } from './dtos/chains.query.dto';
import { RebaseAprResponseDto } from './dtos/rebase-apr.response.dto';

@ApiTags('dex')
@Controller('dex')
export class DexController {
  constructor(private readonly dexService: DexService) {}

  @Get('/rebase-aprs')
  @ApiOperation({
    summary: 'Get rebase APRs for chains',
  })
  @ApiResponse({
    type: RebaseAprResponseDto,
  })
  async getRebaseAprs() {
    return await this.dexService.getRebaseAprs();
  }

  @Post('pools')
  @ApiOperation({
    summary: 'Get all pools',
  })
  @ApiResponse({ type: [PoolResponseDto] })
  async getPools(@Body() dto: GetPoolsBodyDto): Promise<PoolResponseDto[]> {
    return await this.dexService.getPoolsByAddresses(dto);
  }

  @Get('tokens')
  @ApiOperation({
    summary: 'Get all listed tokens for chains',
  })
  @ApiResponse({ type: [TokenResponseDto] })
  @UseBearerTokenAuthGuard()
  async getTokensInfo(
    @Query() query: ChainsQueryDto,
  ): Promise<TokenResponseDto[]> {
    return await this.dexService.getTokensInfo(query.chains);
  }

  @Post('positions/summary')
  @ApiOperation({
    summary:
      'Get aggregated information about positions (deposits and rewards) for a wallet',
  })
  @ApiResponse({ type: PositionsSummaryResponseDto })
  @UseBearerTokenAuthGuard()
  async getPositionsSummary(
    @Body() dto: PositionsSummaryBodyDto,
  ): Promise<PositionsSummaryResponseDto> {
    return await this.dexService.getPositionsSummary(dto);
  }
}
