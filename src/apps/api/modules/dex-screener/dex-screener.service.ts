import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { DexScreenerTokenInfo } from './types';
import { CacheService } from '../cache/cache.service';
import { HOUR } from 'src/common/constants/time';
import { getTokenInfoDexScreenerKey } from '../cache/constants/keys';
import { ITokenInfo } from 'src/common/types';
import { Address } from 'viem';
import { getGexScreenChain } from './utils/dexScreenerChainsAdapter';

@Injectable()
export class DexScreenerService {
  private readonly _logger = new Logger(DexScreenerService.name);
  private readonly _protectedAxios: AxiosInstance;

  constructor(private readonly cacheService: CacheService) {
    this._protectedAxios = axios.create({
      baseURL: `https://api.dexscreener.com`,
    });

    this.getTokenInfo = this.getTokenInfo.bind(this);
  }

  async getTokenInfo(
    tokenOrPairAddress: string,
    chainId: number,
    forceFetch = false,
  ): Promise<ITokenInfo | null> {
    const cachedTokenInfo = await this.cacheService.get<
      DexScreenerTokenInfo['pairs'][0]
    >(getTokenInfoDexScreenerKey(tokenOrPairAddress, chainId));

    if (!tokenOrPairAddress) {
      throw new Error('Token not found.');
    }

    if (cachedTokenInfo && !forceFetch) {
      return {
        chainId: +cachedTokenInfo.chainId,
        address: cachedTokenInfo.baseToken.address as Address,
        name: cachedTokenInfo.baseToken.name,
        displayName: cachedTokenInfo.baseToken.name,
        symbol: cachedTokenInfo.baseToken.symbol,
        decimals: undefined,
        price: +cachedTokenInfo.priceUsd,
        marketCap: cachedTokenInfo.marketCap,
        volume24h: cachedTokenInfo.volume.h24,
      };
    }

    let data: DexScreenerTokenInfo | undefined;

    try {
      const { data: res } =
        await this._protectedAxios.get<DexScreenerTokenInfo>(
          `/latest/dex/tokens/${tokenOrPairAddress}`,
        );

      data = res;
    } catch (error) {}

    if (!data?.pairs?.length) {
      try {
        const { data: res } =
          await this._protectedAxios.get<DexScreenerTokenInfo>(
            `/latest/dex/search?q=${tokenOrPairAddress}`,
          );
        data = res;
      } catch (error) {}
    }

    if (!data?.pairs?.length) {
      try {
        const { data: res } =
          await this._protectedAxios.get<DexScreenerTokenInfo>(
            `/latest/dex/pairs/${getGexScreenChain(
              chainId,
            )}/${tokenOrPairAddress}`,
          );
        data = res;
      } catch (error) {}
    }

    if (!data?.pairs?.length) {
      this._logger.error(
        `Pairs for: ${tokenOrPairAddress} not found on chain: ${getGexScreenChain(
          chainId,
        )}, chainId: ${chainId}`,
      );
      return null;
    }

    const baseTokenInfo = data.pairs?.find(
      (pair) =>
        pair.baseToken.address.toLowerCase() ===
        tokenOrPairAddress.toLowerCase(),
    );

    const quoteTokenInfo = data.pairs?.find(
      (pair) =>
        pair.quoteToken.address.toLowerCase() ===
        tokenOrPairAddress.toLowerCase(),
    );

    const tokenInfo = baseTokenInfo || quoteTokenInfo || data.pairs?.[0];
    const isBaseToken = !!baseTokenInfo || !quoteTokenInfo;
    await this.cacheService.set(
      getTokenInfoDexScreenerKey(tokenOrPairAddress, chainId),
      tokenInfo,
      HOUR,
    );

    const token = isBaseToken ? tokenInfo.baseToken : tokenInfo.quoteToken;

    return {
      chainId: +tokenInfo.chainId,
      address: token.address as Address,
      name: token.name,
      displayName: token.name,
      symbol: token.symbol,
      decimals: undefined,
      price: +tokenInfo.priceUsd,
      marketCap: tokenInfo.marketCap,
      volume24h: tokenInfo.volume.h24,
    };
  }
}
