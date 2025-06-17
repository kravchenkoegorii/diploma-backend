import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Controller, Get, Query } from '@nestjs/common';
import { UseBearerTokenAuthGuard } from '../auth/guards/auth.guard';
import { GetTxListQueryDto } from './dtos/get-tx-list.query.dto';
import { TransactionsHistoryResponse } from './dtos/formatted-transaction.dto';
import { TransactionHistoryService } from './transaction-history.service';

@ApiTags('transaction-history')
@Controller('transaction-history')
@UseBearerTokenAuthGuard()
export class TransactionHistoryController {
  constructor(
    private readonly transactionHistoryService: TransactionHistoryService,
  ) {}

  @Get('transactions')
  @ApiOperation({
    summary: 'Get all wallet transactions by chainId or for all allowed',
  })
  @ApiResponse({ type: TransactionsHistoryResponse })
  async getTransactionHistory(
    @Query() dto: GetTxListQueryDto,
  ): Promise<TransactionsHistoryResponse> {
    return await this.transactionHistoryService.getTransactionHistory(dto);
  }
}
