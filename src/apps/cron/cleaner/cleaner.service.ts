import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TokenPricesRepository } from '../../api/modules/balances/repositories/token-prices.repository';
import { WalletBalancesRepository } from '../../api/modules/balances/repositories/wallet-balances.repository';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan } from 'typeorm';
import { DAY, HOUR } from 'src/common/constants/time';
import { TokenPriceEntity } from 'src/apps/api/modules/balances/entities/token-price.entity';
import { Mutex } from 'async-mutex';

@Injectable()
export class CleanerService implements OnApplicationBootstrap {
  private readonly logger = new Logger('CleanerService');
  private readonly tokenPricesCleanupMutex = new Mutex();

  constructor(
    private readonly tokenPricesRepository: TokenPricesRepository,
    private readonly walletBalancesRepository: WalletBalancesRepository,
  ) {}

  onApplicationBootstrap() {
    setTimeout(async () => {
      await this.cleanupPrices();
    }, 0);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupBalancesAndPrices(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 31 * DAY);
      this.logger.log(
        `Deleting records older than ${cutoffDate.toISOString()}`,
      );

      const walletResult = await this.walletBalancesRepository.delete({
        createdAt: LessThan(cutoffDate),
      });
      this.logger.log(
        `Deleted ${walletResult.affected} wallet balance records.`,
      );
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Delete token prices older than hour except values required for the chart (24h, 7d, 30d)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupPrices(): Promise<void> {
    const release = await this.tokenPricesCleanupMutex.acquire();

    try {
      const cutoffDate = new Date(Date.now() - HOUR);
      this.logger.log(
        `Deleting token price records older than ${cutoffDate.toISOString()}`,
      );

      const batchSizes = 1000;

      const totalTokenPrices = await this.tokenPricesRepository.count({
        where: {
          createdAt: LessThan(cutoffDate),
        },
        order: {
          createdAt: 'ASC',
        },
      });
      this.logger.log(
        `Found ${totalTokenPrices} token price records to delete`,
      );

      for (let i = 0; i < totalTokenPrices; i += batchSizes) {
        const tokensToDelete: TokenPriceEntity[] = [];

        this.logger.log(`Processing batch ${i} - ${i + batchSizes}`);

        const tokenResult = await this.tokenPricesRepository.find({
          where: {
            createdAt: LessThan(cutoffDate),
          },
          take: batchSizes,
          skip: i,
          order: {
            createdAt: 'ASC',
          },
        });

        for (const token of tokenResult) {
          const tokenDate = token.createdAt;

          if (cutoffDate.getTime() - tokenDate.getTime() <= DAY) {
            // If less than 24 hours, keep only hours (11:00, 12:00, 13:00, etc.)
            if (tokenDate.getMinutes() !== 0) {
              tokensToDelete.push(token);
            }
          } else if (cutoffDate.getTime() - tokenDate.getTime() <= 31 * DAY) {
            // If less than 7 days, keep only days (2021-10-01 12:00, 2021-10-02 12:00, etc.)
            if (tokenDate.getHours() !== 12 && tokenDate.getMinutes() !== 0) {
              tokensToDelete.push(token);
            }
          } else {
            // If less than 31 days, delete all records
            tokensToDelete.push(token);
          }
        }

        this.logger.log(
          `Deleting ${tokensToDelete.length} token price records`,
        );

        try {
          await this.tokenPricesRepository.remove(tokensToDelete);
        } catch (error) {
          this.logger.error(
            `Error during cleanup in batch  ${i} - ${i + batchSizes}:`,
            error,
          );
        }
      }

      this.logger.log('Token price records cleanup completed');
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    } finally {
      release();
    }
  }
}
