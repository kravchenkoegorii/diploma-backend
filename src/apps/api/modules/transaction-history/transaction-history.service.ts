import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  FormattedTransactionDto,
  TransactionsHistoryResponse,
} from './dtos/formatted-transaction.dto';
import { GetTxListQueryDto } from './dtos/get-tx-list.query.dto';
import { ALCHEMY_CHAINS_ID_MAP, MAX_TX_ELEMENTS } from './constants.ts';
import { AlchemyService } from './alchemy.service';

@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);

  private readonly serviceMap: Map<number[], any>;

  constructor(private readonly alchemyService: AlchemyService) {
    this.serviceMap = new Map<number[], any>([
      [ALCHEMY_CHAINS_ID_MAP, this.alchemyService],
    ]);
  }

  async getTransactionHistory(
    dto: GetTxListQueryDto,
  ): Promise<TransactionsHistoryResponse> {
    try {
      const transactionPromises = dto.chains.map(async (chainId) => {
        const serviceEntry = Array.from(this.serviceMap.entries()).find(
          ([chainList]) => chainList.includes(chainId),
        );

        if (serviceEntry) {
          const [, service] = serviceEntry;
          return await service.getTransactionHistory({ ...dto, chainId });
        }
        return [];
      });

      const transactionsArrays = await Promise.all(transactionPromises);
      const transactions = transactionsArrays.flat();
      const sortedTransactions = transactions
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, MAX_TX_ELEMENTS);

      return this.paginateTransactions(sortedTransactions, dto);
    } catch (error) {
      this.logger.error(
        `Cannot fetch transaction history for wallet ${
          dto.walletAddress
        } and chains: ${dto?.chains?.join(', ')}`,
        error,
      );
      throw new BadRequestException(error.message);
    }
  }

  private paginateTransactions(
    transactions: FormattedTransactionDto[],
    dto: GetTxListQueryDto,
  ): TransactionsHistoryResponse {
    const limit = Number(dto.limit) || MAX_TX_ELEMENTS;
    const page = Number(dto.page) || 1;
    const total = transactions.length;
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      total,
      page,
      transactions: transactions.slice(start, end),
    };
  }
}
