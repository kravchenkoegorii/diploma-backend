import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { DAY, HOUR, SECOND } from 'src/common/constants/time';
import { CacheService } from '../cache/cache.service';
import {
  getDeFiTokensKey,
  getLlamaTokenPrice,
  getTokenInfoKey,
} from '../cache/constants/keys';
import { isNumber } from 'class-validator';
import { TokensService } from '../tokens/tokens.service';
import { defillamaChainsAdapter } from './utils/defillama-chains-adapter';
import { metalL2, superseed } from 'viem/chains';
import { TokenResponse } from 'src/common/types';
import { DeFiToken } from '../tokens/types';

@Injectable()
export class DeFiLlamaService {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(DeFiLlamaService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly tokensService: TokensService,
  ) {
    this.axios = axios.create({
      baseURL: 'https://api.llama.fi',
    });
    this.getHistoricalTokenPriceByCoingeckoName =
      this.getHistoricalTokenPriceByCoingeckoName.bind(this);
    this.getHistoricalTokenPriceBySymbol =
      this.getHistoricalTokenPriceBySymbol.bind(this);
    this.getHistoricalTokenPrice = this.getHistoricalTokenPrice.bind(this);
    this.getWalletPnlSinceYesterday =
      this.getWalletPnlSinceYesterday.bind(this);
  }

  async getHistoricalTokenPriceByCoingeckoName(
    name: string,
    date: string,
    chainId: number,
    searchWidth = '4h',
  ) {
    name = name.toLowerCase();
    const timestamp = Math.trunc(new Date(date).getTime() / 1000);
    const cacheKey = getLlamaTokenPrice(name, timestamp.toString(), chainId);

    try {
      const cachedData = await this.cacheService.get(cacheKey);

      if (cachedData) {
        return cachedData;
      }

      if (+chainId === metalL2.id || +chainId === superseed.id) {
        const tokenInfo = await this._getHistorycTokenPriceFromDeFiTokenByName(
          name,
          chainId,
        );

        if (tokenInfo) {
          await this.cacheService.set(cacheKey, tokenInfo, HOUR);
        }

        return tokenInfo;
      } else {
        const url = `https://coins.llama.fi/prices/historical/${timestamp}/coingecko:${name}`;

        const { data } = await this.axios.get(url, {
          params: {
            searchWidth,
          },
        });

        await this.cacheService.set(cacheKey, data, HOUR);

        return data;
      }
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Cannot get historical token price',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getHistoricalTokenPriceBySymbol(
    chainId: number,
    symbol: string,
    date: string,
    searchWidth = '4h',
  ) {
    try {
      const tokenInfo = await this.tokensService.getTokenBySymbol(
        symbol,
        chainId,
      );

      if (!tokenInfo || isNumber(tokenInfo)) {
        throw new HttpException('Token not found', HttpStatus.NOT_FOUND);
      }

      return this.getHistoricalTokenPrice(
        tokenInfo.address,
        date,
        chainId,
        searchWidth,
      );
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Cannot get historical token price by symbol',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getHistoricalTokenPrice(
    address: string,
    date: string,
    chainId: number,
    searchWidth = '4h',
  ) {
    const timestamp = Math.trunc(new Date(date).getTime() / 1000);
    const cacheKey = getLlamaTokenPrice(address, timestamp.toString(), chainId);

    const cachedData = await this.cacheService.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      if (+chainId === metalL2.id || +chainId === superseed.id) {
        const tokenInfo =
          await this._getHistorycTokenPriceFromDeFiTokenByAddress(
            address,
            chainId,
          );

        if (tokenInfo) {
          await this.cacheService.set(cacheKey, tokenInfo, HOUR);
        }

        return tokenInfo;
      } else {
        const url = `https://coins.llama.fi/prices/historical/${timestamp}/${defillamaChainsAdapter(
          chainId,
        )}:${address}`;

        const { data } = await this.axios.get(url, {
          params: {
            searchWidth,
          },
        });

        await this.cacheService.set(cacheKey, data, HOUR);

        return data;
      }
    } catch (error) {
      this.logger.error(error);
      throw new HttpException(
        'Cannot get historical token price',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getWalletPnlSinceYesterday(
    walletAddress: string,
    chainId: number,
  ): Promise<{
    pnlUsd: number;
    pnlPercent: string;
  }> {
    try {
      let totalInitialValue = 0;
      let totalCurrentValue = 0;

      const response = await this.tokensService.getWalletBalances(
        walletAddress,
        [chainId],
      );

      const balances = response.find(
        (balance) => balance.chainId === chainId,
      )?.balances;

      if (!balances || !balances || balances.length === 0) {
        return { pnlUsd: 0, pnlPercent: '0' };
      }

      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      yesterdayDate.setHours(0, 0, 0, 0);

      for (const asset of balances) {
        const assetAmount = asset.balance;
        if (!assetAmount || assetAmount <= 0) continue;

        const historicalPriceData = await this.getHistoricalTokenPrice(
          asset.asset.address,
          yesterdayDate.toISOString(),
          chainId,
        );
        const yesterdayPrice =
          historicalPriceData?.coins?.[`base:${asset.asset.address}`]?.price ||
          0;

        const currentPrice = asset.asset.price || 0;

        if (yesterdayPrice > 0 && currentPrice > 0) {
          totalInitialValue += assetAmount * yesterdayPrice;
          totalCurrentValue += assetAmount * currentPrice;
        }
      }

      const pnlUsd = totalCurrentValue - totalInitialValue;
      const pnlPercent =
        totalInitialValue > 0 ? (pnlUsd / totalInitialValue) * 100 : 0;

      const formattedPnlPercent =
        pnlUsd === 0 ? '0' : pnlUsd > 0 ? `+${pnlPercent}` : `-${pnlPercent}`;

      return { pnlUsd, pnlPercent: formattedPnlPercent };
    } catch (error) {
      this.logger.error(
        `Cannot get PNL by wallet address ${walletAddress} and chain Id ${chainId}: ${JSON.stringify(
          error.message,
        )}`,
      );
      throw new HttpException(
        'Cannot get PNL by wallet address',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async _getHistorycTokenPriceFromDeFiTokenByAddress(
    address: string,
    chainId: number,
  ) {
    const defiTokens = await this.cacheService.get<DeFiToken[]>(
      getDeFiTokensKey(),
    );
    const tokensCachadList = await this.cacheService?.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );
    const cachedToken = tokensCachadList?.find(
      (t) => t.token_address.toLowerCase() === address.toLowerCase(),
    );

    if (!cachedToken?.price) return null;

    const defiToken = defiTokens?.find(
      (t) => t.symbol.toLowerCase() === cachedToken?.symbol?.toLowerCase(),
    );

    if (defiToken) {
      return this._createHisroryData(cachedToken, defiToken, chainId);
    } else {
      return null;
    }
  }

  private async _getHistorycTokenPriceFromDeFiTokenByName(
    name: string,
    chainId: number,
  ) {
    const defiTokens = await this.cacheService.get<DeFiToken[]>(
      getDeFiTokensKey(),
    );
    const tokensCachadList = await this.cacheService?.get<TokenResponse[]>(
      getTokenInfoKey(chainId),
    );

    const cachedToken = tokensCachadList?.find(
      (t) =>
        t.symbol.toLowerCase().includes(name.toLowerCase()) ||
        (t?.name && t.name.toLowerCase().includes(name.toLowerCase())),
    );

    if (!cachedToken?.price) return null;

    const defiToken = defiTokens?.find(
      (t) => t.name.toLowerCase() === cachedToken?.name?.toLowerCase(),
    );

    if (defiToken) {
      return this._createHisroryData(cachedToken, defiToken, chainId);
    } else {
      return null;
    }
  }

  private _createHisroryData(
    cachedToken: TokenResponse,
    defiToken: DeFiToken,
    chainId: number,
  ) {
    if (!cachedToken?.price) return null;

    const price24H =
      (parseFloat(cachedToken.price) || 0) /
      (1 + defiToken.price_change_percentage_24h_in_currency / 100);
    const currentTimestamp = Date.now();
    //create llama-type object
    return {
      coins: {
        [`${defillamaChainsAdapter(chainId)}:${cachedToken.token_address}`]: {
          decimals: cachedToken.token_address,
          symbol: cachedToken.symbol,
          price: price24H,
          timestamp: Math.floor((currentTimestamp - DAY) / SECOND),
        },
      },
    };
  }
}
