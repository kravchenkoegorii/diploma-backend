import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ITokenInfo, TokenResponse } from 'src/common/types';
import { Address } from 'viem';
import { DeFiService } from './defi.service';
import { DEFI_CHAINS_ID_MAP } from './constants';
import { getTokenInfoKey } from '../cache/constants/keys';
import { CacheService } from '../cache/cache.service';
import { DeFiBalanceExtended, ITokenBalance } from './types';

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private readonly serviceMap: Map<number[], any>;

  constructor(
    private readonly cacheService: CacheService,
    private readonly defiService: DeFiService,
  ) {
    this.getWalletBalances = this.getWalletBalances.bind(this);
    this.getBalanceByTokenSymbol = this.getBalanceByTokenSymbol.bind(this);
    this.getTokenBySymbol = this.getTokenBySymbol.bind(this);
    this.getTokenInfo = this.getTokenInfo.bind(this);

    this.serviceMap = new Map<number[], any>([
      [DEFI_CHAINS_ID_MAP, this.defiService],
    ]);
  }

  async getWalletBalances(walletAddress: string, chains: number[]) {
    try {
      const balances: ITokenBalance[] = [];

      for (const chainId of chains) {
        for (const [chainList, service] of this.serviceMap) {
          const formattedChainId =
            typeof chainId === 'number' ? chainId : parseFloat(chainId);
          if (chainList.includes(formattedChainId)) {
            try {
              const balancesOnChain = await service.getWalletBalances(
                walletAddress,
                formattedChainId,
              );
              balances.push({ chainId, balances: balancesOnChain });
              break;
            } catch (error) {
              balances.push({ chainId, balances: [] });
            }
          }
        }
      }
      return balances;
    } catch (error) {
      this.logger.error(`Cannot get wallet balances: ${JSON.stringify(error)}`);
      throw new HttpException(
        'Cannot get wallet balances',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getBalanceByTokenSymbol(
    walletAddress: Address,
    symbol: string,
    chainId: number,
  ): Promise<DeFiBalanceExtended | null> {
    try {
      const formattedChainId =
        typeof chainId === 'number' ? chainId : parseFloat(chainId);

      for (const [chainList, service] of this.serviceMap) {
        if (chainList.includes(formattedChainId)) {
          return await service.getBalanceByTokenSymbol(
            walletAddress,
            symbol,
            formattedChainId,
          );
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Cannot get balance by token symbol: ${JSON.stringify(error.message)}`,
      );
      throw new HttpException(
        'Cannot get balance by token symbol',
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
    isThrowError = true,
  ): Promise<ITokenInfo | null> {
    try {
      const formattedChainId =
        typeof chainId === 'number' ? chainId : parseFloat(chainId);

      for (const [chainList, service] of this.serviceMap) {
        if (chainList.includes(formattedChainId)) {
          return await service.getTokenBySymbol(
            symbol,
            chainId,
            forceUpdate,
            fallBackToPriceOnly,
          );
        }
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Cannot get token by symbol: ${symbol}, message ${JSON.stringify(
          error.message,
        )}`,
      );
      if (isThrowError) {
        throw new HttpException(
          'Cannot get token by symbol',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      } else {
        return null;
      }
    }
  }

  async getTokenInfo(
    address: string,
    chainId: number,
    forceUpdate = true,
    fallBackToPriceOnly = true,
  ): Promise<ITokenInfo | number | null> {
    try {
      const response = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      const token = response?.find(
        (t) =>
          t.token_address.toLowerCase() === address.toLowerCase() && t.listed,
      );

      if (!token) throw new Error(`address: ${address}, chain ID: ${chainId}`);

      return this.getTokenBySymbol(
        token.symbol,
        chainId,
        forceUpdate,
        fallBackToPriceOnly,
      );
    } catch (error) {
      this.logger.error(
        `Cannot get token by: ${JSON.stringify(error.message)}`,
      );
      throw new HttpException(
        'Cannot get token by address',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
