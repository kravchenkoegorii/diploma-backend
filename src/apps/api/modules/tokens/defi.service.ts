import { Client, createClient, everything } from '@de-fi/sdk';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isNumber } from 'class-validator';
import { HOUR, MINUTE } from 'src/common/constants/time';
import { ITokenInfo, TokenResponse } from 'src/common/types';
import {
  Address,
  erc20Abi,
  formatEther,
  formatUnits,
  getContract,
  MulticallParameters,
} from 'viem';
import { BinanceService } from '../binance/binance.service';
import {
  getDeFiBalancesKey,
  getDeFiTokenPageInfoKey,
  getResponceTokenInfoKey,
  getTokenInfoKey,
} from '../cache/constants/keys';
import { CacheService } from '../cache/cache.service';
import { DexScreenerService } from '../dex-screener/dex-screener.service';
import {
  cacheExchange,
  fetchExchange,
  OperationContext,
  TypedDocumentNode,
} from '@urql/core';
import { createSubgraphClient } from '../../../../common/utils/create-subgraph-client';
import { ViemService } from '../viem/viem.service';
import { DeFiBalances, IDeFiTokenPageInfo } from './types';
import { defiChainsAdapter } from './utils/defi-chains-adapter';
import { chainsScansHelper } from '../../../../common/utils/chains-scans-helper';
import axios from 'axios';
import { CoingeckoTokenIdService } from './coingecko-token-id.service';

@Injectable()
export class DeFiService {
  private readonly defiClient: Client;
  private readonly logger = new Logger(DeFiService.name);

  private readonly graphClient: <
    Data,
    Variables extends Record<string, unknown> = Record<string, unknown>,
  >(
    document: TypedDocumentNode<Data, Variables>,
    params: Variables,
    context?: Partial<OperationContext>,
  ) => Promise<Data>;

  constructor(
    private readonly cacheService: CacheService,
    private readonly dexScreenerService: DexScreenerService,
    private readonly binanceService: BinanceService,
    private readonly viemService: ViemService,
    private readonly coingeckoTokenIdService: CoingeckoTokenIdService,
  ) {
    this.defiClient = createClient({
      url: 'https://public-api.de.fi/graphql',
      headers: { 'X-Api-Key': process.env.DEFI_API_KEY || '' },
    });

    this.graphClient = createSubgraphClient({
      exchanges: [cacheExchange, fetchExchange],
      fetch: fetch as typeof fetch,
      url: 'https://api-scanner.defiyield.app/graphql',
      fetchOptions: {
        method: 'POST',
        headers: {
          'X-Api-Key': process.env.DEFI_API_KEY || '',
        },
      },
    });

    this.getWalletBalances = this.getWalletBalances.bind(this);
    this.getBalanceByTokenSymbol = this.getBalanceByTokenSymbol.bind(this);
    this.getTokenBySymbol = this.getTokenBySymbol.bind(this);
    this.searchTokens = this.searchTokens.bind(this);
    this.getDefiTokenPageInfo = this.getDefiTokenPageInfo.bind(this);
  }

  async getWalletBalances(walletAddress: string, chainId: number) {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const cacheKey = getDeFiBalancesKey(walletAddress, chainId);
      const cachedBalances = await this.cacheService?.get<DeFiBalances>(
        cacheKey,
      );

      let balances: DeFiBalances = [];

      if (cachedBalances) {
        return cachedBalances;
      } else {
        const response = await this.defiClient.query(
          {
            assetBalances: [
              {
                walletAddress,
                chainId: defiChainsAdapter(chainId),
              },
              {
                assets: {
                  asset: {
                    address: true,
                    name: true,
                    displayName: true,
                    symbol: true,
                    decimals: true,
                    price: true,
                  },
                  balance: true,
                },
              },
            ],
          },
          {
            fetchOptions: {
              headers: {
                'Cache-Control': 'no-cache',
              },
            },
          },
        );

        balances = response?.data?.assetBalances.assets || [];
      }

      const tokensCacheKey = getTokenInfoKey(chainId);
      const tokens = await this.cacheService?.get<TokenResponse[]>(
        tokensCacheKey,
      );
      const tokensMap = new Map<string, TokenResponse>(
        (tokens || []).map((token) => [
          token.token_address.toLowerCase(),
          token,
        ]),
      );

      if (tokens && chainId) {
        const tokensBalanceQueue: MulticallParameters['contracts'][0][] = [];
        const listedTokens = tokens.filter((token) => token?.listed);

        for (let i = 0; i < listedTokens.length; i++) {
          const token = listedTokens[i];

          tokensBalanceQueue.push({
            address: token.token_address as Address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [walletAddress],
          });
        }

        const TOKENS_IN_CHUNK = 300;

        for (let i = 0; i < tokensBalanceQueue.length; i += TOKENS_IN_CHUNK) {
          const chunk = tokensBalanceQueue.slice(i, i + TOKENS_IN_CHUNK);
          const multiCallResponse = await viemClient.multicall({
            contracts: chunk,
          });

          for (let j = 0; j < chunk.length; j++) {
            const token = listedTokens[i + j];
            const balanceFromContract = multiCallResponse[j]?.result as
              | bigint
              | undefined;

            if (balanceFromContract !== undefined) {
              const asset = balances.find(
                (asset) =>
                  asset.asset.address.toLowerCase() ===
                  token.token_address.toLowerCase(),
              );

              const balanceFormatted = +formatUnits(
                balanceFromContract,
                token.decimals || 18,
              );

              if (asset) {
                asset.balance = balanceFormatted;
              } else {
                balances?.push({
                  asset: {
                    address: token.token_address,
                    name: token.symbol,
                    displayName: token.symbol,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    price: +(token.price || 0),
                  },
                  balance: balanceFormatted,
                });
              }
            }
          }
        }
      }

      if (balances) {
        balances = balances.filter((asset) => {
          if (asset.balance <= 0) return false;

          const address = asset?.asset?.address?.toLowerCase();
          const tokenPrice =
            asset?.asset?.price ?? Number(tokensMap.get(address)?.price) ?? 0;
          if (asset && asset.asset && !asset.asset.price) {
            asset.asset.price = tokenPrice;
          }

          return asset.balance * tokenPrice >= 0.01;
        });

        balances = balances.sort(
          (a, b) =>
            b.balance * (b?.asset?.price || 0) -
            a.balance * (a?.asset?.price || 0),
        );
      }

      const filteredBalances = Object.values(balances)
        .filter((asset) => asset.balance * (asset?.asset?.price || 0) >= 0.01)
        .sort(
          (a, b) =>
            b.balance * (b?.asset?.price || 0) -
            a.balance * (a?.asset?.price || 0),
        );

      if (!!filteredBalances?.length) {
        await this.cacheService?.set(cacheKey, filteredBalances, MINUTE);
      }

      return balances;
    } catch (error) {
      this.logger.error(
        `Cannot get wallet balances: ${JSON.stringify(
          error,
        )}, chainId: ${chainId}`,
      );
      throw new HttpException(
        'Cannot get wallet balances',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getBalanceByTokenSymbol(
    walletAddress: Address,
    symbol: string,
    chainId: number,
  ) {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const token = await this.getTokenBySymbol(symbol, chainId, false, false);
      if (!token || isNumber(token)) {
        return null;
      }
      let balanceFormatted = 0;

      if (symbol === 'ETH') {
        const balance = await viemClient.getBalance({
          address: walletAddress,
        });

        balanceFormatted = +formatEther(balance);
      } else {
        const tokenContract = getContract({
          address: token.address as Address,
          abi: erc20Abi,
          client: viemClient,
        });

        const balance = await tokenContract.read.balanceOf([walletAddress]);

        balanceFormatted = +formatUnits(balance, token.decimals || 18);
      }
      return {
        asset: {
          address: token.address,
          name: token.symbol,
          displayName: token.symbol,
          symbol: token.symbol,
          decimals: token.decimals,
          price: +(token.price || 0),
        },
        balance: balanceFormatted,
        usdValue: +(token.price || 0) * (balanceFormatted || 0),
      };
    } catch (error) {
      const customErrorMessage = `Cannot get balance by token symbol: ${JSON.stringify(
        error.message,
      )}, chainId: ${chainId}`;

      this.logger.error(customErrorMessage);

      throw new HttpException(
        customErrorMessage,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getTokenBySymbol(
    symbol: string,
    chainId: number,
    forceUpdate = false,
    fallBackToPriceOnly = true,
    onlyListed = false,
  ): Promise<ITokenInfo | number | null> {
    try {
      symbol = symbol?.toUpperCase?.();
      const key = getResponceTokenInfoKey(symbol.toUpperCase(), chainId);
      const cachedToken = await this.cacheService?.get<ITokenInfo>(key);
      if (!forceUpdate && cachedToken) {
        return {
          chainId: +cachedToken.chainId,
          address: cachedToken.address,
          name: cachedToken.name,
          displayName: cachedToken.displayName,
          symbol: cachedToken.symbol,
          decimals: cachedToken.decimals,
          price: +cachedToken.price,
          scan_url: chainsScansHelper(chainId, cachedToken.address, true),
          marketCap: cachedToken.marketCap,
          volume24h: cachedToken.volume24h,
        };
      }

      const response =
        (await this.cacheService.get<TokenResponse[]>(
          getTokenInfoKey(chainId),
        )) || [];

      let token = (response?.find(
        (t) => t.symbol.toLowerCase() === symbol.toLowerCase() && t.listed,
      ) ||
        response?.find(
          (t) =>
            t.symbol.toLowerCase().includes(symbol.toLowerCase()) && t.listed,
        )) as TokenResponse;

      let tokenMarketCap = token?.market_cap;
      let volume24h = token?.volume_24h || 0;

      if (!token) {
        const Fuse = await require('fuse.js');
        const fuse = new Fuse(
          response.filter((token) => token.listed),
          {
            keys: ['symbol'],
            threshold: 0.1,
            ignoreLocation: true,
          },
        );
        const fuseResults = fuse.search(symbol);
        token = fuseResults?.[0]?.item;
      }

      let tokenFromDexScreener: ITokenInfo | null = null;
      if (!token?.market_cap || !volume24h) {
        tokenFromDexScreener = await this.dexScreenerService.getTokenInfo(
          token?.token_address,
          chainId,
        );
        if (tokenFromDexScreener) {
          tokenMarketCap = tokenFromDexScreener?.marketCap;
          volume24h = tokenFromDexScreener?.volume24h || 0;
        }
      }
      let defiTokenPageInfo: IDeFiTokenPageInfo | null = null;
      if (!tokenMarketCap || !volume24h) {
        defiTokenPageInfo = await this.getDefiTokenPageInfo(
          token.symbol,
          chainId,
        );
        if (defiTokenPageInfo) {
          tokenMarketCap = defiTokenPageInfo?.market_cap;
          volume24h = defiTokenPageInfo?.total_volume || 0;
        }
      }

      const tokenInfo = (
        await this.defiClient.query({
          assets: [
            {
              where: {
                addresses: [token?.token_address],
                chainId: defiChainsAdapter(chainId),
              },
            },
            {
              chainId: true,
              address: true,
              name: true,
              displayName: true,
              symbol: true,
              decimals: true,
              price: true,
            },
          ],
        })
      )?.data?.assets?.[0] as ITokenInfo;
      if (!tokenInfo && !token) {
        return null;
      }

      if (!tokenInfo && token) {
        return {
          chainId: +chainId,
          address: token?.token_address,
          name: token?.symbol,
          displayName: token?.symbol,
          symbol: token?.symbol.toUpperCase(),
          decimals: token?.decimals,
          price:
            tokenFromDexScreener?.price ||
            defiTokenPageInfo?.current_price ||
            +(token?.price || 0),
          marketCap: tokenMarketCap || 0,
          volume24h: volume24h || 0,
        };
      }

      if (!tokenInfo?.price || Number(tokenInfo?.price) === 0) {
        const fallbackTokenInfo =
          tokenFromDexScreener ||
          (await this.dexScreenerService.getTokenInfo(
            token?.token_address,
            chainId,
          ));

        if (!fallbackTokenInfo?.price && token.symbol && fallBackToPriceOnly) {
          const binanceRate = await this.binanceService.getRateForOneCurrency(
            token.symbol,
          );

          const tokens = await this.cacheService.get<TokenResponse[]>(
            getTokenInfoKey(chainId),
          );
          const aerodromeToken = tokens?.find(
            (token) => token.symbol.toUpperCase() === symbol,
          );

          if (!aerodromeToken) {
            return binanceRate;
          }

          return {
            symbol: aerodromeToken?.symbol || token.symbol,
            name: aerodromeToken?.symbol || token.symbol,
            displayName: aerodromeToken.symbol || token.symbol,
            price:
              +(aerodromeToken?.price || 0) ||
              tokenFromDexScreener?.price ||
              defiTokenPageInfo?.current_price ||
              binanceRate ||
              0,
            chainId: +chainId,
            address: aerodromeToken?.token_address || token?.token_address,
            decimals: aerodromeToken?.decimals || token.decimals,
            scan_url: chainsScansHelper(chainId, token.token_address, true),
            marketCap: tokenMarketCap || 0,
            volume24h,
          };
        } else if (fallbackTokenInfo) {
          return {
            ...fallbackTokenInfo,
            decimals: token.decimals,
            chainId: chainId,
          };
        }
      }

      const tokenFormatted: ITokenInfo = {
        chainId,
        address: tokenInfo.address,
        name: tokenInfo.name || '',
        displayName: tokenInfo.displayName || '',
        symbol: tokenInfo.symbol || '',
        decimals: tokenInfo.decimals || 0,
        price:
          tokenFromDexScreener?.price ||
          defiTokenPageInfo?.current_price ||
          +(token.price || 0) ||
          tokenInfo.price ||
          0,
        marketCap: tokenMarketCap || 0,
        volume24h: volume24h || 0,
        scan_url: chainsScansHelper(chainId, tokenInfo.address, true),
      };

      await this.cacheService?.set(key, tokenFormatted, HOUR);
      return tokenFormatted;
    } catch (error) {
      this.logger.error(
        `Cannot get token by symbol: ${JSON.stringify(error.message)}`,
      );
      throw new HttpException(
        'Cannot get token by symbol',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchTokens(searchQuery: string) {
    try {
      const response = await this.defiClient.query({
        assets: [{}, { ...everything }],
        searchText: searchQuery,
      });

      return response?.data?.assets;
    } catch (error) {
      this.logger.error(`Cannot search any: ${JSON.stringify(error.message)}`);
      throw new HttpException(
        'Cannot search any',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getDefiTokenPageInfo(
    symbol: string,
    chainId: number,
  ): Promise<IDeFiTokenPageInfo | null> {
    const key = getDeFiTokenPageInfoKey(symbol.toUpperCase(), chainId);
    const cachedInfo = await this.cacheService?.get<IDeFiTokenPageInfo>(key);
    if (cachedInfo) {
      return cachedInfo;
    }

    const coingeckoTokenId = this.coingeckoTokenIdService.getTokenKey(symbol);
    const searchQueries = coingeckoTokenId
      ? [coingeckoTokenId, symbol]
      : [symbol];

    for (const search of searchQueries) {
      try {
        const { data } = await this.fetchDeFiTokenData(search);
        const targetToken = data?.items?.find(
          (token) =>
            token.id.toLowerCase() === coingeckoTokenId?.toLowerCase() ||
            token.symbol.toLowerCase() === symbol.toLowerCase(),
        );

        if (targetToken) {
          this.logger.log(
            `Received DeFi info page for token: ${symbol}, search: ${search}`,
            data,
          );

          await this.cacheService?.set(key, targetToken, HOUR);
          return targetToken;
        }
      } catch (error) {
        this.logger.error(
          `Error getting DeFi info page for token: ${symbol}, search: ${search}`,
          error,
        );
      }
    }

    this.logger.warn(`Token ${symbol} not found on DeFi API`);
    return null;
  }

  private async fetchDeFiTokenData(search: string) {
    return axios.get<{ items: IDeFiTokenPageInfo[] }>(
      `https://api.de.fi/v2/coingecko/markets?`,
      {
        params: {
          order: 'rank',
          direction: 'asc',
          limit: 100,
          page: 1,
          'priceChangePercentage[]': ['1h', '24h', '7d'],
          search,
          onlyTrending: false,
          currency: 'USD',
          sparkLine: true,
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
  }
}
