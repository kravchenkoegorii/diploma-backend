import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { DexService } from 'src/apps/api/modules/dex/dex.service';
import { MAP_CHAIN_ID_CHAIN } from '../../api/modules/viem/constants';

@Injectable()
export class DexCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DexCronService.name);
  private readonly tokenInfoMutex = new Mutex();
  private readonly poolsDataMutex = new Mutex();
  private readonly epochsLatestMutex = new Mutex();

  private readonly chains = Object.keys(MAP_CHAIN_ID_CHAIN).map(
    (chainId) => +chainId,
  );

  constructor(private readonly dexService: DexService) {}

  onApplicationBootstrap() {
    setTimeout(async () => {
      await this.getAllTokensInfo();
      await this.getAllEpochsLatest();
      await this.getAllData();
    }, 0);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async getAllTokensInfo(): Promise<void> {
    const release = await this.tokenInfoMutex.acquire();

    try {
      const promises = this.chains.map(async (chain) =>
        this.dexService.getAllTokensInfo(chain),
      );
      await Promise.all(promises);
    } catch (error) {
    } finally {
      release();
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async getAllData(): Promise<void> {
    const release = await this.poolsDataMutex.acquire();

    try {
      const promises = this.chains.map(async (chain) =>
        this.dexService.getAllData(chain),
      );
      await Promise.all(promises);
    } catch (error) {
    } finally {
      release();
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async getAllEpochsLatest(): Promise<void> {
    const release = await this.epochsLatestMutex.acquire();

    try {
      const promises = this.chains.map(async (chain) =>
        this.dexService.getAllEpochsLatest(chain),
      );
      await Promise.all(promises);
    } catch (error) {
    } finally {
      release();
    }
  }
}
