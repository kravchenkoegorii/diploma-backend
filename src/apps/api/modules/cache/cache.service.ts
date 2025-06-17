import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key);
  }

  async set(key: string, value: unknown, ttl?: number) {
    return await this.cacheManager.set(key, value, ttl);
  }

  async keys(pattern: string) {
    return await this.cacheManager.store.keys(pattern);
  }

  async del(key: string) {
    return await this.cacheManager.del(key);
  }

  async ttl(key: string): Promise<number> {
    return await this.cacheManager.store.ttl(key);
  }
}
