import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { AerodromeStatisticsService } from './aerodrome-statistics.service';
import { TokenPricesRepository } from '../balances/repositories/token-prices.repository';
import { ViemService } from '../viem/viem.service';
import { IToken } from 'src/common/types/token';
import { chainsConfig } from 'src/common/constants/chains';
import {
  Address,
  BaseError,
  formatUnits,
  getContract,
  zeroAddress,
} from 'viem';
import { sugarAbi } from 'src/common/constants/chains/abis/sugar.abi';
import { tokenRatesAbi } from 'src/common/constants/chains/abis/token-rates.abi';
import { PRICES_CONNECTORS } from 'src/common/constants/connectors';
import { HOUR, SECOND } from 'src/common/constants/time';
import Decimal from 'decimal.js';
import {
  getAllPoolsDataKey,
  getDeFiTokensKey,
  getEpochsLatestKey,
  getPoolsDataKey,
  getTokenInfoKey,
} from '../cache/constants/keys';
import { uniqBy } from 'lodash';
import { parseBigIntToString } from 'src/common/utils/parse-big-int-to-string';
import { PoolData, TPoolReward } from '../../../../common/types';
import { rewardsAbi } from '../../../../common/constants/chains/abis/rewards.abi';
import { BASE_ADDITIONAL_TOKENS } from 'src/common/constants/chains/base/base.contracts';
import { DeFiToken } from '../tokens/types';
import { chainsScansHelper } from '../../../../common/utils/chains-scans-helper';

@Injectable()
export class AerodromeDataService {
  private readonly logger = new Logger(AerodromeDataService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly aerodromeStatisticsService: AerodromeStatisticsService,
    private readonly tokenPricesRepo: TokenPricesRepository,
    private readonly viemService: ViemService,
  ) {}

  async getDexTokensInfo(chainId: number): Promise<void> {
    this.logger.log(`Chain ${chainId}: start updating Aerodrome tokens info`);
    const timeStart = Date.now();

    const viemClient = this.viemService.getViemClient(chainId);

    const block = await viemClient.getBlock();
    const blockNumber = block.number;
    const blockTimestamp = block.timestamp;

    const limit = BigInt(500);
    let offset = BigInt(0);
    const allTokens: IToken[] = [];

    const { sugarContract, tokenRates } = chainsConfig[chainId];

    try {
      const sugarContractInstance = getContract({
        address: sugarContract,
        abi: sugarAbi,
        client: viemClient,
      });

      const tokenRatesContractInstance = getContract({
        address: tokenRates,
        abi: tokenRatesAbi,
        client: viemClient,
      });

      let maxIterations = 20;

      while (maxIterations > 0) {
        maxIterations--;
        const tokenChunk = (await sugarContractInstance.read.tokens(
          [
            limit,
            offset,
            zeroAddress,
            offset > BASE_ADDITIONAL_TOKENS.length
              ? []
              : BASE_ADDITIONAL_TOKENS,
          ],
          { blockNumber },
        )) as unknown as IToken[];

        allTokens.push(
          ...tokenChunk.map((token) => ({
            ...token,
            listed:
              token.listed ||
              BASE_ADDITIONAL_TOKENS.includes(
                token.token_address.toLowerCase() as Address,
              ),
            scan_url: chainsScansHelper(chainId, token.token_address, true),
          })),
        );

        offset += BigInt(limit);
      }

      const stableToken = allTokens.find(
        (token) =>
          token.token_address.toLowerCase() ===
          chainsConfig[chainId]?.stableToken?.toLowerCase(),
      );

      if (!stableToken) {
        throw new Error('Stable coin USDC not found');
      }

      const tokensMap: Map<string, IToken> = new Map();

      for (let i = 0; i < allTokens.length; i++) {
        const token = allTokens[i];
        if (!tokensMap.has(token.token_address.toLowerCase())) {
          tokensMap.set(token.token_address.toLowerCase(), token);
        }
      }

      const USDCToETHRate = await tokenRatesContractInstance.read.getRateToEth(
        [stableToken.token_address, false],
        { blockNumber },
      );
      const USDCToETHRateValue = +formatUnits(
        USDCToETHRate,
        18 + (18 - stableToken.decimals),
      );

      const MAX_SRC_LEN = 10;
      const prices: bigint[] = [];
      const tokenAddresses = Array.from(tokensMap)
        .filter(([, token]) => token.listed)
        .map(([, token]) => token.token_address);

      for (let i = 0; i < tokenAddresses.length; i += MAX_SRC_LEN) {
        const chunk = tokenAddresses.slice(i, i + MAX_SRC_LEN);

        if (chunk.length === 0) {
          break;
        }

        try {
          const pricesResponse = await viemClient.readContract({
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
          prices.push(...pricesResponse);
        } catch (error) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 2 * SECOND));
            const pricesResponse = await viemClient.readContract({
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
            prices.push(...pricesResponse);
          } catch (error) {
            this.logger.error(
              `Chain ${chainId}: error during fetching prices: ${
                (error as BaseError).shortMessage ||
                (error as BaseError).message
              }`,
            );
            prices.push(...Array(chunk.length).fill(BigInt(0)));
          }
        }
      }

      for (let i = 0; i < prices.length; i++) {
        const price = prices[i];
        const tokenAddress = tokenAddresses[i];
        const token = tokensMap.get(tokenAddress?.toLowerCase());

        if (token) {
          // XX: decimals are auto set to 18
          const denom = 18 + (18 - token.decimals);
          token.price =
            new Decimal(formatUnits(price || BigInt(0), denom))
              .div(USDCToETHRateValue)
              .toString() || '0';
          tokensMap.set(token.token_address.toLowerCase(), token);
        }
      }

      const deFiTokens = await this.cacheService.get<DeFiToken[]>(
        getDeFiTokensKey(),
      );

      if (!deFiTokens) {
        throw new Error('DeFi tokens not found');
      }

      const tokens = uniqBy(
        Array.from(tokensMap).map(([_, token]) => {
          return {
            ...token,
            chainId: chainId,
          };
        }),
        (t) => t.token_address,
      );

      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        const deFiToken = deFiTokens?.find(
          (t) => t.symbol.toLowerCase() === token.symbol.toLowerCase(),
        );

        if (deFiToken && token.listed) {
          token.market_cap = deFiToken.market_cap;
          token.volume_24h = deFiToken.total_volume;
          token.is_meme = deFiToken?.is_meme || false;

          if (!token.price) {
            token.price = deFiToken.current_price.toString();
          }
        }
      }

      const wrappedETH = tokens.find(
        (token) => token.symbol?.toLowerCase() === 'weth' && token.listed,
      );
      if (wrappedETH) {
        const eth = { ...wrappedETH };
        eth.symbol = 'ETH';
        eth.token_address = '0x0000000000000000000000000000000000000000';
        eth.scan_url = chainsScansHelper(chainId, eth.token_address, true);
        eth.market_cap = undefined;
        eth.volume_24h = undefined;
        tokens.push(eth);
      }

      const listed = tokens.filter((t) => t.listed);
      const hasPrices = tokens.filter((t) => +(t.price ?? 0) > 0);
      const listedWithPrices = listed.filter((t) => +(t.price ?? 0) > 0);

      this.logger.log(
        `Chain ${chainId}: found ${allTokens.length} tokens (${tokens.length} unique, ${listed.length} listed, ${hasPrices.length} with prices, ${listedWithPrices.length} listed with prices)`,
      );

      const tokenPriceEntities = listed.map((token) =>
        this.tokenPricesRepo.create({
          address: token.token_address,
          price: token.price ?? '0',
          block_number: blockNumber.toString(),
          chain_id: chainId,
          createdAt: new Date(+blockTimestamp.toString() * SECOND),
        }),
      );
      await this.tokenPricesRepo.save(tokenPriceEntities);

      await this.cacheService.set(
        getTokenInfoKey(chainId),
        parseBigIntToString(tokens),
        HOUR * 2,
      );
    } catch (error) {
      this.logger.error(
        `Chain ${chainId}: error during fetching token: ${
          (error as BaseError).shortMessage || (error as BaseError).message
        }`,
      );
    } finally {
      const timeEnd = Date.now();
      const timeDiff = (timeEnd - timeStart) / 1000;
      this.logger.log(
        `Chain ${chainId}: end updating Aerodrome tokens info in ${timeDiff}s`,
      );
    }
  }

  async getDexData(chainId: number): Promise<void> {
    this.logger.log(`Chain ${chainId}: start updating Aerodrome data`);
    const timeStart = Date.now();

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      const tokens = await this.cacheService.get<IToken[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokens || tokens?.length === 0) {
        throw new Error('Tokens data not found');
      }

      const tokenMap = new Map<string, IToken>();
      tokens.forEach((token) => {
        tokenMap.set(token.token_address.toLowerCase(), token);
      });

      const { sugarContract } = chainsConfig[chainId];

      const sugarContractInstance = getContract({
        address: sugarContract,
        abi: sugarAbi,
        client: viemClient,
      });

      let offset = BigInt(0);
      const limit = BigInt((await sugarContractInstance.read.MAX_LPS()) || 100);
      let hasMoreData = true;
      const allPoolsData: PoolData[] = [];

      while (hasMoreData) {
        const poolsChunk = (await sugarContractInstance.read.all([
          limit,
          offset,
        ])) as unknown as PoolData[];

        if (poolsChunk?.length === 0) {
          hasMoreData = false;
          break;
        }

        allPoolsData.push(
          ...poolsChunk.map((pool) => {
            const token0 = tokenMap.get(pool.token0.toLowerCase());
            const token1 = tokenMap.get(pool.token1.toLowerCase());
            pool.tokenPrice0 = token0?.price;
            pool.tokenPrice1 = token1?.price;
            pool.chainId = chainId;
            return pool;
          }),
        );

        offset += BigInt(poolsChunk.length);
      }

      await this.cacheService.set(
        getAllPoolsDataKey(chainId),
        parseBigIntToString(allPoolsData),
        HOUR,
      );

      const parsedData = parseBigIntToString(allPoolsData) as PoolData[];

      const rewards = await this.cacheService.get<TPoolReward[]>(
        getEpochsLatestKey(chainId),
      );

      const poolsWithAdditionalData =
        await this.aerodromeStatisticsService.addMoreDataToPools(
          chainId,
          parsedData,
          rewards || [],
        );

      await this.cacheService.set(
        getPoolsDataKey(chainId),
        poolsWithAdditionalData,
        HOUR,
      );

      this.logger.log(`Chain ${chainId}: found ${allPoolsData.length} pools`);
    } catch (error) {
      this.logger.error(
        `Chain ${chainId}: error during fetching pools: ${
          (error as BaseError).shortMessage || (error as BaseError).message
        }`,
      );
    } finally {
      const timeEnd = Date.now();
      const timeDiff = (timeEnd - timeStart) / 1000;
      this.logger.log(
        `Chain ${chainId}: end updating Aerodrome data in ${timeDiff}s`,
      );
    }
  }

  async getDexEpochsLatest(chainId: number): Promise<void> {
    this.logger.log(`Chain ${chainId}: start updating Aerodrome rewards data`);

    const viemClient = this.viemService.getViemClient(chainId);

    const timeStart = Date.now();
    try {
      const cacheKey = getEpochsLatestKey(chainId);

      const { rewardsSugar } = chainsConfig[chainId];

      const rewardsContract = getContract({
        address: rewardsSugar,
        abi: rewardsAbi,
        client: viemClient,
      });

      let offset = BigInt(0);
      const limit = BigInt(100);
      let maxIterations = 70;
      const allPoolRewardsData: TPoolReward[] = [];

      while (maxIterations > 0) {
        maxIterations--;
        const poolsRewardsChunk = (await rewardsContract.read.epochsLatest([
          limit,
          offset,
        ])) as TPoolReward[];

        allPoolRewardsData.push(
          ...poolsRewardsChunk.map((r) => {
            return {
              ...r,
              chainId: chainId,
            };
          }),
        );

        offset += BigInt(limit);
      }

      const withoutDuplicates = allPoolRewardsData.filter(
        (value, index, self) =>
          self.findIndex(
            (t) => t.lp.toLowerCase() === value.lp.toLowerCase(),
          ) === index,
      );

      this.logger.log(
        `Chain ${chainId}: found ${withoutDuplicates.length} pools rewards data`,
      );
      await this.cacheService.set(cacheKey, withoutDuplicates, HOUR);
    } catch (error) {
      this.logger.error(
        `Chain ${chainId}: error during fetching data about epoch: ${
          (error as BaseError).shortMessage || (error as BaseError).message
        }`,
      );
    } finally {
      const timeEnd = Date.now();
      const timeDiff = (timeEnd - timeStart) / 1000;
      this.logger.log(
        `Chain ${chainId}: end updating Aerodrome rewards data in ${timeDiff}s`,
      );
    }
  }
}
