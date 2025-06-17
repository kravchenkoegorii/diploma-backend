import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { BaseError } from 'viem';
import { CacheService } from '../../api/modules/cache/cache.service';
import axios from 'axios';
import { getDeFiTokensKey } from 'src/apps/api/modules/cache/constants/keys';
import { HOUR } from 'src/common/constants/time';
import { DeFiPagination, DeFiToken } from 'src/apps/api/modules/tokens/types';

@Injectable()
export class DeFiCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeFiCronService.name);
  private readonly tokenMutex = new Mutex();

  constructor(private readonly cacheService: CacheService) {}

  onApplicationBootstrap() {
    setTimeout(async () => {
      await this.getTokensInfo();
    }, 0);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async getTokensInfo(): Promise<DeFiToken[] | undefined> {
    const cacheKey = getDeFiTokensKey();
    const ttl = await this.cacheService.ttl(cacheKey);
    const maxTtl = 3 * HOUR;

    // If the cache is not expired, we don't need to update it
    if (ttl > maxTtl - HOUR / 2) {
      this.logger.log('DeFi tokens info is up to date');
      return;
    }
    const release = await this.tokenMutex.acquire();

    const timeStart = Date.now();

    try {
      this.logger.log('Start updating DeFi tokens info');
      const coingeckoTokens: DeFiToken[] = await this.getDefiTokens([
        'base-ecosystem',
        'optimism-ecosystem',
      ]);
      const memeTokens: DeFiToken[] = await this.getDefiTokens(['meme-token']);

      const tokenMap = new Map<string, DeFiToken>();

      for (const token of coingeckoTokens) {
        tokenMap.set(token.name, { ...token, is_meme: false });
      }

      for (const memeToken of memeTokens) {
        if (tokenMap.has(memeToken.name)) {
          tokenMap.get(memeToken.name)!.is_meme = true;
        } else {
          tokenMap.set(memeToken.name, { ...memeToken, is_meme: true });
        }
      }

      const uniqueTokens = Array.from(tokenMap.values());

      await this.cacheService.set(cacheKey, uniqueTokens, maxTtl);

      return uniqueTokens;
    } catch (error) {
      this.logger.error(
        `Error during fetching token: ${
          (error as BaseError).shortMessage || (error as BaseError).message
        }`,
      );
    } finally {
      release();
      const timeEnd = Date.now();
      const timeDiff = (timeEnd - timeStart) / 1000;
      this.logger.log(`End updating DeFi tokens info in ${timeDiff}s`);
    }
  }

  private async getDefiTokens(categories: string[]): Promise<DeFiToken[]> {
    const coingeckoTokens: DeFiToken[] = [];
    let hasMoreData = true;
    let page = 1;

    while (hasMoreData) {
      const { data: res } = await axios.get<DeFiPagination<DeFiToken>>(
        `https://api.de.fi/v2/coingecko/markets`,
        {
          params: {
            order: 'market_cap',
            direction: 'desc',
            limit: 100,
            page: page,
            priceChangePercentage: ['1h', '24h', '7d'],
            search: undefined,
            categories,
            onlyTrending: false,
            currency: 'USD',
            sparkLine: false,
          },
          headers: {
            origin: 'https://de.fi',
            priority: 'u=1, i',
            referer: 'https://de.fi/',
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          },
        },
      );

      const chunk = res.items;
      coingeckoTokens.push(...chunk);

      if (chunk.length === 0 || res.pages === page) {
        hasMoreData = false;
      } else {
        page += 1;
      }
    }

    this.logger.log(`Fetched ${coingeckoTokens.length} tokens (${page} pages)`);

    return coingeckoTokens;
  }
}
