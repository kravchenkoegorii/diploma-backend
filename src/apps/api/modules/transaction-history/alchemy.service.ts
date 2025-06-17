import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Alchemy, AssetTransfersCategory, SortingOrder } from 'alchemy-sdk';
import { IAlchemyConfig } from 'src/common/configs/alchemy.config';
import { ConfigNames } from 'src/common/types/enums/config-names.enum';
import { MINUTE } from '../../../../common/constants/time';
import { CacheService } from '../cache/cache.service';
import {
  getTokenInfoKey,
  getUserTransactionsKeyByChainId,
} from '../cache/constants/keys';
import { FormattedTransactionDto } from './dtos/formatted-transaction.dto';
import {
  ALCHEMY_CHAINS_ID_MAP,
  ALCHEMY_NETWORKS,
  MAX_TX_ELEMENTS,
} from './constants.ts';
import { GetTxListForChainDto } from './dtos/get-tx-list.query.dto';
import { FormatTransactions } from './utils/format-transactions';
import { ITxToFromat } from './types';
import { IToken } from 'src/common/types/token';

@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly alchemyConfig: IAlchemyConfig;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly formatter: FormatTransactions,
  ) {
    this.alchemyConfig = this.configService.getOrThrow<IAlchemyConfig>(
      ConfigNames.ALCHEMY,
    );
  }

  async getTransactionHistory(
    dto: GetTxListForChainDto,
  ): Promise<FormattedTransactionDto[]> {
    try {
      let chains: number[] = [];
      if (dto?.chainId) chains = [dto?.chainId];
      if (!dto?.chainId) chains = ALCHEMY_CHAINS_ID_MAP;

      const getTransactions = async (
        type: 'fromAddress' | 'toAddress',
        client: Alchemy,
      ) => {
        return await client.core.getAssetTransfers({
          [type]: dto.walletAddress,
          category: [
            AssetTransfersCategory.ERC20,
            AssetTransfersCategory.ERC721,
            AssetTransfersCategory.EXTERNAL,
          ],
          order: SortingOrder.DESCENDING,
          excludeZeroValue: false,
          withMetadata: true,
          maxCount: 1000,
        });
      };

      const allTransactions = await Promise.all(
        chains.map(async (chainId) => {
          const tokens = await this.cacheService.get<IToken[]>(
            getTokenInfoKey(chainId),
          );

          if (!tokens) {
            this.logger.error(`No tokens found in cache, chainId: ${chainId}`);
            return [];
          }

          const cachedTx = await this.cacheService.get<
            FormattedTransactionDto[]
          >(getUserTransactionsKeyByChainId(dto.walletAddress, chainId));

          if (cachedTx) {
            return cachedTx;
          } else {
            try {
              const client = new Alchemy({
                apiKey: this.alchemyConfig?.apiKey,
                network: ALCHEMY_NETWORKS[chainId],
              });

              const [from, to] = await Promise.all([
                getTransactions('fromAddress', client),
                getTransactions('toAddress', client),
              ]);
              const transactions = [...from.transfers, ...to.transfers];
              const uniqueTransactions = new Set();

              const filteredTransactions: ITxToFromat[] = transactions
                .sort(
                  (a, b) =>
                    new Date(b.metadata.blockTimestamp).getTime() -
                    new Date(a.metadata.blockTimestamp).getTime(),
                )
                .filter((tx) => {
                  if (uniqueTransactions.has(tx.hash)) {
                    return false;
                  }

                  uniqueTransactions.add(tx.hash);
                  return true;
                })
                .map((tx) => ({
                  from: tx.from,
                  to: tx.to,
                  value: tx.value,
                  hash: tx.hash,
                  asset: 'ETH',
                  rawContractAddress: tx.rawContract.address,
                  timestamp: tx.metadata.blockTimestamp,
                }))
                .slice(0, 200);

              const listed = tokens?.filter((token) => token.listed);

              const formattedTransactions = await this.formatter.format(
                filteredTransactions,
                dto.walletAddress,
                listed,
                MAX_TX_ELEMENTS,
                chainId,
              );

              await this.cacheService.set(
                getUserTransactionsKeyByChainId(dto.walletAddress, chainId),
                formattedTransactions,
                5 * MINUTE,
              );

              return formattedTransactions;
            } catch (error) {
              this.logger.error(
                `Error getting transactions, chainId: ${chainId}`,
                error,
              );
              return [];
            }
          }
        }),
      );

      return [...allTransactions.flat()];
    } catch (error) {
      this.logger.error(
        `Cannot fetch transaction history for wallet ${dto.walletAddress}`,
        error,
      );
      return [];
    }
  }
}
