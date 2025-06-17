import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ITokenInfo } from 'src/common/types';
import { CacheService } from '../cache/cache.service';
import { HOUR } from 'src/common/constants/time';

interface IBinanceResponse {
  symbol: string;
  price: string;
}

@Injectable()
export class BinanceService {
  private readonly protectedAxios: AxiosInstance;

  constructor(private readonly cacheService: CacheService) {
    this.protectedAxios = axios.create({
      baseURL: `https://data-api.binance.vision`,
    });
  }

  public async getRateForOneCurrency(
    symbol: string,
    forceUpdate = false,
  ): Promise<ITokenInfo['price'] | null> {
    const key = `binance-${symbol}`;
    const cachedValue = await this.cacheService.get<ITokenInfo['price']>(key);

    if (cachedValue && !forceUpdate) {
      return cachedValue;
    }

    try {
      const { data } = await this.protectedAxios.get<IBinanceResponse>(
        '/api/v3/ticker/price',
        {
          params: {
            symbol: `${symbol?.toUpperCase?.()}USDT`,
          },
        },
      );

      await this.cacheService.set(key, +data.price || null, HOUR);

      return +data.price || null;
    } catch (error) {
      return null;
    }
  }
}
