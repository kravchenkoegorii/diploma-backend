import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../types/transactions.enum';

export class FormattedTransactionDto {
  @ApiProperty({
    description: 'Transaction title',
  })
  title: string;

  @ApiProperty({
    description: 'Transaction hash',
  })
  txHash: string;

  @ApiProperty({
    description: 'Type of transaction (e.g., Send, Receive, Exchange)',
    enum: TransactionType,
  })
  type: TransactionType;

  @ApiPropertyOptional({
    description: 'Type of action',
  })
  actionTitle?: 'string';

  @ApiProperty({
    description: 'Token symbol',
  })
  symbol: string;

  @ApiProperty({
    description: 'Token amount',
  })
  amount: number;

  @ApiPropertyOptional({
    description: 'Token amount in USD',
  })
  amountUsd?: number;

  @ApiProperty({
    description: 'Transaction timestamp',
  })
  timestamp: number;

  @ApiProperty({
    description: 'Chain ID',
  })
  chainId: number;
}

export class TransactionsHistoryResponse {
  @ApiProperty({
    description: 'Transactions',
    type: FormattedTransactionDto,
    isArray: true,
  })
  transactions: FormattedTransactionDto[];

  @ApiProperty({
    description: 'Total amount',
  })
  total: number;

  @ApiProperty({ description: 'Page' })
  page: number;
}
