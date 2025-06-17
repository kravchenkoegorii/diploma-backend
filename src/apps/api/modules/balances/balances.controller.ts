import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BalancesService } from './balances.service';
import {
  BalanceHistoryTickDto,
  BalanceOverviewResponseDto,
  GetBalanceHistoryQueryDto,
  GetBalanceOverviewQueryDto,
} from './dtos';
import { UseBearerTokenAuthGuard } from '../auth/guards/auth.guard';

@ApiTags('balances')
@Controller('balances')
@UseBearerTokenAuthGuard()
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get('history')
  @ApiOperation({ summary: 'Get balance history for specified interval' })
  @ApiResponse({
    status: 200,
    description: 'Balance history ticks for the specified interval',
    type: BalanceHistoryTickDto,
    isArray: true,
  })
  async getBalanceHistory(
    @Query() query: GetBalanceHistoryQueryDto,
  ): Promise<BalanceHistoryTickDto[]> {
    return this.balancesService.getBalanceHistory(
      query.chains,
      query.walletAddress,
      query.interval,
    );
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get balance overview' })
  @ApiResponse({
    status: 200,
    description: 'Balance overview for wallet address',
    type: BalanceOverviewResponseDto,
  })
  async getBalanceOverview(
    @Query() query: GetBalanceOverviewQueryDto,
  ): Promise<BalanceOverviewResponseDto> {
    return this.balancesService.getAggregatedBalanceOverview(
      query.chains,
      query.walletAddress,
    );
  }
}
