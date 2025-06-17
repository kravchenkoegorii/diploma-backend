import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CacheService } from 'src/apps/api/modules/cache/cache.service';
import { Address, erc20Abi, formatUnits, zeroAddress } from 'viem';
import { TokenResponse } from '../../../../common/types';
import { getTokenInfoKey } from '../cache/constants/keys';
import { TokenPricesRepository } from './repositories/token-prices.repository';
import { PRICES_CONNECTORS } from '../../../../common/constants/connectors';
import { tokenRatesAbi } from '../../../../common/constants/chains/abis/token-rates.abi';
import Decimal from 'decimal.js';
import { SECOND } from '../../../../common/constants/time';
import { WalletBalancesRepository } from './repositories/wallet-balances.repository';
import { WalletsRepository } from '../users/repositories/wallets-repository.service';
import {
  addHours,
  eachDayOfInterval,
  eachHourOfInterval,
  eachMinuteOfInterval,
  endOfMonth,
  set,
  subDays,
  subHours,
  subMinutes,
  subMonths,
} from 'date-fns';
import { BalanceHistoryInterval } from '../../../../common/enums/balance-history-interval.enum';
import { chunk, intersectionWith } from 'lodash';
import { WalletEntity } from '../users/entities/wallet.entity';
import {
  AssetDto,
  AssetOverviewDto,
  BalanceHistoryTickDto,
  BalanceOverviewDto,
  BalanceOverviewResponseDto,
  GetTokenBalancesResponseDto,
} from './dtos';
import { ViemService } from '../viem/viem.service';
import { chainsConfig } from '../../../../common/constants/chains';
import { MAP_CHAIN_ID_CHAIN } from '../viem/constants';

@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  private readonly CHUNK_SIZE = 100;

  constructor(
    private readonly cacheService: CacheService,
    private readonly tokenPriceRepo: TokenPricesRepository,
    private readonly walletBalancesRepo: WalletBalancesRepository,
    private readonly walletsRepo: WalletsRepository,
    private readonly viemService: ViemService,
  ) {}

  async getBalanceHistory(
    chainIds: number[],
    walletAddress: string,
    interval: BalanceHistoryInterval,
  ): Promise<BalanceHistoryTickDto[]> {
    chainIds = intersectionWith(
      chainIds,
      Object.keys(MAP_CHAIN_ID_CHAIN).map((c) => +c),
    );

    const wallet = await this.walletsRepo.findOne({
      where: { address: walletAddress },
    });

    if (!wallet) {
      throw new Error('Wallet not found!');
    }

    const tokensByChain = await Promise.all(
      chainIds.map(async (chainId) => {
        const tokens =
          (await this.cacheService.get<TokenResponse[]>(
            getTokenInfoKey(chainId),
          )) || [];
        if (!tokens || tokens.length === 0) {
          throw new Error(`No tokens found in cache for chain ${chainId}`);
        }
        return { chainId, tokens };
      }),
    );
    const tokensMap = new Map<number, TokenResponse[]>(
      tokensByChain.map(({ chainId, tokens }) => [chainId, tokens]),
    );

    const tickTimestamps = this.getTickTimestamps(interval);
    const lastTick = tickTimestamps[tickTimestamps.length - 1];
    const history: BalanceHistoryTickDto[] = [];
    const batchSize = 5;

    for (let i = 0; i < tickTimestamps.length; i += batchSize) {
      const batch = tickTimestamps.slice(i, i + batchSize);

      const batchPromises = batch.map(async (tick) => {
        let displayTick = tick;

        const chainBalances = await Promise.all(
          chainIds.map(async (chainId) => {
            const viemClient = this.viemService.getViemClient(chainId);
            const latestBlock = await viemClient.getBlock();
            const latestBlockNumber = BigInt(latestBlock.number);
            const currentTimestamp = Number(latestBlock.timestamp);

            const delta = currentTimestamp - tick;
            const blockTime = chainsConfig[chainId].blockTime;
            const deltaBlocks = BigInt(Math.floor(delta / blockTime));
            const targetBlockNumber = latestBlockNumber - deltaBlocks;
            const targetBlockTimestamp = (
              await viemClient.getBlock({
                blockNumber: targetBlockNumber,
              })
            ).timestamp;

            const isToSave = tick !== lastTick;

            if (
              interval === BalanceHistoryInterval.TWENTY_FOUR_HOURS &&
              tick === lastTick
            ) {
              const nowDate = new Date(currentTimestamp * 1000);
              let rounded = set(nowDate, {
                minutes: 0,
                seconds: 0,
                milliseconds: 0,
              });
              if (
                nowDate.getMinutes() !== 0 ||
                nowDate.getSeconds() !== 0 ||
                nowDate.getMilliseconds() !== 0
              ) {
                rounded = addHours(rounded, 1);
              }
              displayTick = Math.floor(rounded.getTime() / 1000);
            }

            const tokens = tokensMap.get(chainId);
            if (!tokens) {
              throw new Error(`Tokens for chain ${chainId} are not available`);
            }

            const balanceData = await this.getUserTokenBalances(
              chainId,
              wallet,
              targetBlockNumber,
              targetBlockTimestamp,
              tokens,
              isToSave,
              false,
            );
            return balanceData.totalBalanceUsd;
          }),
        );

        const totalBalanceUsd = chainBalances.reduce(
          (sum, val) => sum + val,
          0,
        );
        return {
          date: new Date(displayTick * 1000).getTime(),
          totalBalanceUsd,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      history.push(...batchResults);
    }

    return history;
  }

  async getAggregatedBalanceOverview(
    chainIds: number[],
    walletAddress: Address,
  ): Promise<BalanceOverviewResponseDto> {
    chainIds = intersectionWith(
      chainIds,
      Object.keys(MAP_CHAIN_ID_CHAIN).map((c) => +c),
    );
    const overviews = await Promise.all(
      chainIds.map(async (chainId) =>
        this.getBalanceOverview(chainId, walletAddress),
      ),
    );

    let assets = overviews.flatMap((overview) => overview.assets);

    const totalBalanceUsd = assets.reduce(
      (sum, asset) => sum + asset.amountUSD,
      0,
    );

    assets = assets.map((asset) => {
      return {
        ...asset,
        allocationPercent:
          totalBalanceUsd > 0 ? (asset.amountUSD / totalBalanceUsd) * 100 : 0,
      };
    });

    return {
      currentBalance: overviews.reduce(
        (sum, overview) => sum + overview.currentBalance,
        0,
      ),
      previousBalance: overviews.reduce(
        (sum, overview) => sum + overview.previousBalance,
        0,
      ),
      tokenQty: assets.length,
      assets: assets,
    };
  }

  async getUserTokenBalances(
    chainId: number,
    wallet: WalletEntity,
    blockNumber: bigint,
    blockTimestamp: bigint,
    tokens: TokenResponse[],
    isToSave: boolean,
    isOverview: boolean,
  ): Promise<GetTokenBalancesResponseDto> {
    try {
      const walletBalances = await this.walletBalancesRepo.findOne({
        where: {
          wallet_id: wallet.id,
          block_number: blockNumber.toString(),
          chain_id: chainId,
        },
      });

      if (walletBalances && !isOverview) {
        return {
          totalBalanceUsd: +walletBalances.balance,
          assets: [],
        };
      }

      const listedTokens = tokens.filter(
        (token) => token?.listed && token.token_address !== zeroAddress,
      );
      const nativeToken = tokens.find(
        (token) =>
          token.symbol.toUpperCase() === this.getNativeTokenSymbol(chainId),
      );
      const [tokenBalances, ethBalance] = await Promise.all([
        this.processTokenBalancesInChunks(
          chainId,
          wallet.address,
          listedTokens,
          blockNumber,
        ),
        this.getNativeBalanceData(
          chainId,
          wallet.address as Address,
          nativeToken?.price || '0',
          nativeToken?.decimals || 18,
          blockNumber,
        ),
      ]);

      const tokensToPrice = tokenBalances.filter(
        (asset) => asset.token_address !== zeroAddress,
      );

      if (tokensToPrice.length > 0) {
        const tokenPricesMap = await this.getTokenPricesForBlockFromAssets(
          chainId,
          tokensToPrice,
          blockNumber,
          blockTimestamp,
          tokens,
        );

        tokensToPrice.forEach((asset) => {
          const key = asset.token_address.toLowerCase();
          const fetchedPrice = tokenPricesMap.get(key);
          if (fetchedPrice) {
            asset.price = fetchedPrice;
            asset.amountUSD =
              parseFloat(asset.amount) * parseFloat(fetchedPrice);
          }
        });
      }

      if (ethBalance) tokenBalances.push(ethBalance);

      const totalBalanceUsd = tokenBalances.reduce(
        (sum, asset) => sum + asset.amountUSD,
        0,
      );
      const assets = tokenBalances.map((asset) => ({
        ...asset,
        chainId: chainId,
      }));

      if (isToSave) {
        await this.walletBalancesRepo.upsert(
          {
            wallet_id: wallet.id,
            balance: totalBalanceUsd.toString(),
            block_number: blockNumber.toString(),
            chain_id: chainId,
          },
          ['wallet_id', 'block_number', 'chain_id'],
        );
      }

      return {
        assets,
        totalBalanceUsd,
      };
    } catch (error) {
      this.logger.error(
        `Chain ${chainId}, blockNumber: ${blockNumber}, blockTimestamp: ${blockTimestamp}: Cannot get wallet balances: ${error.message}`,
      );
      throw new HttpException(
        'Cannot get wallet balances',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async getBalanceOverview(
    chainId: number,
    walletAddress: Address,
  ): Promise<BalanceOverviewDto> {
    try {
      const viemClient = this.viemService.getViemClient(chainId);

      const wallet = await this.walletsRepo.findOne({
        where: { address: walletAddress },
      });

      if (!wallet) {
        throw new Error('Wallet not found!');
      }

      const tokens = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens) {
        throw new Error('No tokens found in cache');
      }

      const latestBlock = await viemClient.getBlock();
      const currentBlockNumber = BigInt(latestBlock.number);
      const currentBlockTimestamp = latestBlock.timestamp;

      const blockDiff = BigInt(
        Math.floor((24 * 3600) / chainsConfig[chainId].blockTime),
      );
      const block24hAgo = currentBlockNumber - blockDiff;
      const block24hAgoTimestamp = (
        await viemClient.getBlock({
          blockNumber: block24hAgo,
        })
      ).timestamp;
      const [currentBalances, previousBalances] = await Promise.all([
        this.getUserTokenBalances(
          chainId,
          wallet,
          currentBlockNumber,
          currentBlockTimestamp,
          tokens,
          true,
          true,
        ),
        this.getUserTokenBalances(
          chainId,
          wallet,
          block24hAgo,
          block24hAgoTimestamp,
          tokens,
          true,
          true,
        ),
      ]);

      const previousMap = new Map<string, AssetOverviewDto>();
      const previousAssets: AssetOverviewDto[] =
        (previousBalances.assets as AssetOverviewDto[]) || [];
      for (const asset of previousAssets) {
        previousMap.set(asset.token_address.toLowerCase(), {
          ...asset,
          pnl: 0,
        });
      }

      const currentAssets: AssetOverviewDto[] =
        (currentBalances.assets as AssetOverviewDto[]) || [];
      const updatedCurrentAssets = currentAssets.map((asset) => {
        const key = asset.token_address.toLowerCase();
        const prev = previousMap.get(key);
        let pnl = 0;
        if (prev && prev.price && asset.price && parseFloat(prev.price) > 0) {
          pnl =
            ((parseFloat(asset.price) - parseFloat(prev.price)) /
              parseFloat(prev.price)) *
            100;
        }
        return { ...asset, pnl };
      });

      return {
        currentBalance: currentBalances.totalBalanceUsd,
        assets: updatedCurrentAssets,
        previousBalance: previousBalances.totalBalanceUsd,
      };
    } catch (error) {
      this.logger.error(
        `Chain ${chainId}: Cannot get balance overview: ${error.message}, error body: ${error}`,
      );
      return {
        currentBalance: 0,
        assets: [],
        previousBalance: 0,
      };
    }
  }

  private async getTokenPricesForBlockFromAssets(
    chainId: number,
    assets: AssetDto[],
    blockNumber: bigint,
    blockTimestamp: bigint,
    tokens: TokenResponse[],
  ): Promise<Map<string, string>> {
    const viemClient = this.viemService.getViemClient(chainId);

    const { tokenRates } = chainsConfig[chainId];

    const stableToken = tokens.find(
      (token) =>
        token.token_address.toLowerCase() ===
        chainsConfig[chainId]?.stableToken?.toLowerCase(),
    );

    if (!stableToken) {
      throw new Error('Stable coin USDC not found');
    }

    const USDCToETHRate = await viemClient.readContract({
      address: tokenRates,
      abi: tokenRatesAbi,
      functionName: 'getRateToEth',
      args: [stableToken.token_address, false] as const,
      blockNumber,
    });
    const USDCToETHRateValue = +formatUnits(
      USDCToETHRate,
      18 + (18 - stableToken.decimals),
    );

    const tokenPriceMap = new Map<string, string>();

    const tokenAddresses = assets.map((asset) => asset.token_address);

    const minBlock = (blockNumber - BigInt(10)).toString();
    const maxBlock = (blockNumber + BigInt(10)).toString();
    const existingPrices = await this.tokenPriceRepo
      .createQueryBuilder('tp')
      .where('tp.address IN (:...addresses)', { addresses: tokenAddresses })
      .andWhere('tp.block_number BETWEEN :minBlock AND :maxBlock', {
        minBlock,
        maxBlock,
      })
      .andWhere('tp.chain_id = :chainId', { chainId })
      .getMany();

    for (const addr of tokenAddresses) {
      const records = existingPrices.filter(
        (r) => r.address.toLowerCase() === addr.toLowerCase(),
      );
      if (records.length > 0) {
        const sorted = records.sort((a, b) => {
          const diffA =
            BigInt(a.block_number) > blockNumber
              ? BigInt(a.block_number) - blockNumber
              : blockNumber - BigInt(a.block_number);
          const diffB =
            BigInt(b.block_number) > blockNumber
              ? BigInt(b.block_number) - blockNumber
              : blockNumber - BigInt(b.block_number);
          return diffA > diffB ? 1 : diffA < diffB ? -1 : 0;
        });
        tokenPriceMap.set(addr.toLowerCase(), sorted[0].price);
      }
    }

    const addressesToFetch = tokenAddresses.filter(
      (addr) => !tokenPriceMap.has(addr.toLowerCase()),
    );
    if (addressesToFetch.length > 0) {
      const MAX_SRC_LEN = 20;
      const fetchPromises: any[] = [];
      for (let i = 0; i < addressesToFetch.length; i += MAX_SRC_LEN) {
        const chunk = addressesToFetch.slice(i, i + MAX_SRC_LEN);
        fetchPromises.push(
          (async () => {
            try {
              return await viemClient.readContract({
                address: tokenRates,
                abi: tokenRatesAbi,
                functionName: 'getManyRatesToEthWithCustomConnectors',
                args: [
                  chunk,
                  false,
                  [...chunk, ...PRICES_CONNECTORS[chainId]],
                  BigInt(10),
                ] as const,
                blockNumber,
              });
            } catch (error) {
              try {
                await new Promise((resolve) => setTimeout(resolve, 2 * SECOND));
                return await viemClient.readContract({
                  address: tokenRates,
                  abi: tokenRatesAbi,
                  functionName: 'getManyRatesToEthWithCustomConnectors',
                  args: [
                    chunk,
                    false,
                    [...chunk, ...PRICES_CONNECTORS[chainId]],
                    BigInt(10),
                  ] as const,
                  blockNumber,
                });
              } catch (error) {
                this.logger.error(
                  `Error during fetching prices: ${error.message}`,
                );
                return Array(chunk.length).fill(BigInt(0));
              }
            }
          })(),
        );
      }
      const fetchedPricesChunks = await Promise.all(fetchPromises);
      const fetchedPrices: bigint[] = fetchedPricesChunks.flat();

      for (let i = 0; i < addressesToFetch.length; i++) {
        const addr = addressesToFetch[i];
        const price = fetchedPrices[i];
        const asset = assets.find(
          (a) => a.token_address.toLowerCase() === addr.toLowerCase(),
        );

        const decimals = asset?.decimals ?? 18;
        const denom = 18 + (18 - decimals);
        const computedPrice =
          new Decimal(formatUnits(price || BigInt(0), denom))
            .div(USDCToETHRateValue)
            .toString() || '0';
        tokenPriceMap.set(addr.toLowerCase(), computedPrice);

        await this.tokenPriceRepo.upsert(
          {
            address: addr,
            price: computedPrice,
            block_number: blockNumber.toString(),
            chain_id: chainId,
            createdAt: new Date(+blockTimestamp.toString() * SECOND),
          },
          ['address', 'block_number', 'chain_id'],
        );
      }
    }

    return tokenPriceMap;
  }

  private async processTokenBalancesInChunks(
    chainId: number,
    walletAddress: string,
    tokens: TokenResponse[],
    blockNumber: bigint,
  ): Promise<GetTokenBalancesResponseDto['assets']> {
    const viemClient = this.viemService.getViemClient(chainId);

    const chunks = chunk(tokens, this.CHUNK_SIZE);
    const chunkPromises = chunks.map(async (chunk) => {
      const balanceContracts = chunk.map((token) => ({
        address: token.token_address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      }));
      const nameContracts = chunk.map((token) => ({
        address: token.token_address as Address,
        abi: erc20Abi,
        functionName: 'name',
      }));

      const [balances, names] = await Promise.all([
        viemClient.multicall({ contracts: balanceContracts, blockNumber }),
        viemClient.multicall({ contracts: nameContracts, blockNumber }),
      ]);

      const results: GetTokenBalancesResponseDto['assets'] = [];
      for (let i = 0; i < chunk.length; i++) {
        const token = chunk[i];
        const balance = balances[i]?.result as bigint;
        const name = names[i]?.result as string;
        if (
          !balance ||
          balance < BigInt(5) / BigInt(10 ** (token.decimals || 18))
        )
          continue;

        const formattedBalance = formatUnits(balance, token.decimals);
        results.push({
          token_address: token.token_address,
          symbol: token.symbol,
          price: '',
          tokenLogo: `https://raw.githubusercontent.com/SmolDapp/tokenAssets/main/tokens/${chainId}/${token.token_address.toLowerCase()}/logo.svg`,
          tokenName: name || '',
          amount: formattedBalance,
          amountUSD: 0,
          allocationPercent: 0,
          decimals: token.decimals,
        });
      }
      return results;
    });
    const chunkResults = await Promise.all(chunkPromises);

    return chunkResults.flat();
  }

  private async getNativeBalanceData(
    chainId: number,
    walletAddress: Address,
    price: string,
    decimals: number,
    blockNumber: bigint,
  ): Promise<GetTokenBalancesResponseDto['assets'][0] | null> {
    const viemClient = this.viemService.getViemClient(chainId);

    const balance = await viemClient.getBalance({
      address: walletAddress,
      blockNumber,
    });

    if (!balance || balance < 5 / 10 ** (decimals || 18)) {
      return null;
    }

    const formattedBalance = formatUnits(balance, decimals);

    return {
      token_address: zeroAddress,
      symbol: MAP_CHAIN_ID_CHAIN[chainId].nativeCurrency.symbol,
      price,
      tokenName: MAP_CHAIN_ID_CHAIN[chainId].nativeCurrency.name,
      tokenLogo: 'https://aerodrome.finance/tokens/ETH.svg',
      amount: formattedBalance,
      amountUSD: parseFloat(formattedBalance) * parseFloat(price),
      allocationPercent: 0,
      decimals,
    };
  }

  /**
   * Generates an array of ticks (timestamps in seconds) for the given interval.
   * For '1H' - every minute for the last hour;
   * For '24H' - every hour for the last 24 hours, rounded up to the next full hour;
   * For '7D' and '30D' - every day at 12:00 for the last 7 or 30 days;
   * For '1Y' - 12 values, one for each month for the last year.
   */
  private getTickTimestamps(interval: BalanceHistoryInterval): number[] {
    const now = new Date();
    switch (interval) {
      case BalanceHistoryInterval.ONE_HOUR: {
        const start = subMinutes(now, 60);
        const ticks = eachMinuteOfInterval({ start, end: now });
        return ticks.map((t) => Math.floor(t.getTime() / 1000));
      }
      case BalanceHistoryInterval.TWENTY_FOUR_HOURS: {
        const rawStart = subHours(now, 24);
        let start = set(rawStart, { minutes: 0, seconds: 0, milliseconds: 0 });
        if (
          rawStart.getMinutes() !== 0 ||
          rawStart.getSeconds() !== 0 ||
          rawStart.getMilliseconds() !== 0
        ) {
          start = addHours(start, 1);
        }
        const end = set(now, { minutes: 0, seconds: 0, milliseconds: 0 });
        const fullHours = eachHourOfInterval({ start, end });
        const ticks = fullHours.map((t) => Math.floor(t.getTime() / 1000));
        if (now.getTime() !== end.getTime()) {
          ticks.push(Math.floor(now.getTime() / 1000));
        }
        return ticks;
      }
      case BalanceHistoryInterval.SEVEN_DAYS: {
        let todayNoon = set(now, {
          hours: 12,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
        });
        if (now < todayNoon) {
          todayNoon = subDays(todayNoon, 1);
        }
        const start = subDays(todayNoon, 6);
        const ticks = eachDayOfInterval({ start, end: todayNoon }).map((t) =>
          Math.floor(
            set(t, {
              hours: 12,
              minutes: 0,
              seconds: 0,
              milliseconds: 0,
            }).getTime() / 1000,
          ),
        );
        return ticks;
      }
      case BalanceHistoryInterval.THIRTY_DAYS: {
        let todayNoon = set(now, {
          hours: 12,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
        });
        if (now < todayNoon) {
          todayNoon = subDays(todayNoon, 1);
        }
        const start = subDays(todayNoon, 29);
        const ticks = eachDayOfInterval({ start, end: todayNoon }).map((t) =>
          Math.floor(
            set(t, {
              hours: 12,
              minutes: 0,
              seconds: 0,
              milliseconds: 0,
            }).getTime() / 1000,
          ),
        );
        return ticks;
      }
      case BalanceHistoryInterval.ONE_YEAR: {
        const ticks: Date[] = [];
        const day = now.getDate();
        for (let i = 11; i >= 0; i--) {
          const d = subMonths(now, i);
          let tick = set(d, {
            date: day,
            hours: d.getHours(),
            minutes: d.getMinutes(),
            seconds: d.getSeconds(),
            milliseconds: 0,
          });
          if (tick.getMonth() !== d.getMonth()) {
            tick = endOfMonth(d);
          }
          ticks.push(tick);
        }
        return ticks.map((t) => Math.floor(t.getTime() / 1000));
      }
      default:
        throw new Error('Invalid interval');
    }
  }

  private getNativeTokenSymbol(chainId: number) {
    switch (chainId) {
      default:
        return 'WETH';
    }
  }
}
