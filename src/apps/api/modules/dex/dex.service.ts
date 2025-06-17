import { Injectable, Logger } from '@nestjs/common';
import {
  IPoolsFilter,
  ITokenInfo,
  PoolData,
  TokenResponse,
} from 'src/common/types';
import { Address } from 'viem';
import { IToken } from '../../../../common/types/token';
import { UserEntity } from '../users/entities/user.entity';
import { AerodromeService } from '../aerodrome/aerodrome.service';
import { VelodromeService } from '../velodrome/velodrome.service';
import { BASE_ID } from '../../../../common/constants/chains/base';
import { VelodromeStatisticsService } from '../velodrome/velodrome-statistics.service';
import { AerodromeStatisticsService } from '../aerodrome/aerodrome-statistics.service';
import { AerodromeDataService } from '../aerodrome/aerodrome-data.service';
import { VelodromeDataService } from '../velodrome/velodrome-data.service';
import { AerodromeClaimerService } from '../aerodrome/action-services/aerodrome-claimer.service';
import { AerodromeDepositService } from '../aerodrome/action-services/aerodrome-deposit.service';
import { AerodromeLockerService } from '../aerodrome/action-services/aerodrome-locker.service';
import { AerodromeStakerService } from '../aerodrome/action-services/aerodrome-staker.service';
import { AerodromeVoterService } from '../aerodrome/action-services/aerodrome-voter.service';
import { AerodromeWithdrawService } from '../aerodrome/action-services/aerodrome-withdraw.service';
import { VelodromeClaimerService } from '../velodrome/action-services/velodrome-claimer.service';
import { VelodromeDepositService } from '../velodrome/action-services/velodrome-deposit.service';
import { VelodromeLockerService } from '../velodrome/action-services/velodrome-locker.service';
import { VelodromeStakerService } from '../velodrome/action-services/velodrome-staker.service';
import { VelodromeVoterService } from '../velodrome/action-services/velodrome-voter.service';
import { VelodromeWithdrawService } from '../velodrome/action-services/velodrome-withdraw.service';
import { AerodromeSwapperService } from '../aerodrome/action-services/aerodrome-swapper.service';
import { VelodromeSwapperService } from '../velodrome/action-services/velodrome-swapper.service';
import { GetPoolsBodyDto } from './dtos/get-pools.body.dto';
import { PoolResponseDto } from './dtos/pool.response.dto';
import { getPoolsDataKey, getTokenInfoKey } from '../cache/constants/keys';
import { CacheService } from '../cache/cache.service';
import { TokenResponseDto } from './dtos/token-response.dto';
import { OPTIMISM_ID } from '../../../../common/constants/chains/optimism';
import { RebaseAprDto } from './dtos/rebase-apr.response.dto';
import { PositionsSummaryBodyDto } from './dtos/positions-summary.body.dto';
import { PositionsSummaryResponseDto } from '../../../../common/dtos/positions-summary-response.dto';
import { MAP_CHAIN_ID_CHAIN } from '../viem/constants';
import {
  ActionType,
  LockFilters,
  LockOperations,
} from '../openai/tools-description/types';
import { WithdrawAmountTypeEnum } from '../../../../common/enums/withdraw-amount-type.enum';
import { intersectionWith } from 'lodash';
import { TokensService } from '../tokens/tokens.service';

@Injectable()
export class DexService {
  private readonly logger = new Logger(DexService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly aerodromeService: AerodromeService,
    private readonly aerodromeStatsService: AerodromeStatisticsService,
    private readonly aerodromeDataService: AerodromeDataService,
    private readonly aerodromeClaimerService: AerodromeClaimerService,
    private readonly aerodromeDepositService: AerodromeDepositService,
    private readonly aerodromeLockerService: AerodromeLockerService,
    private readonly aerodromeStakerService: AerodromeStakerService,
    private readonly aerodromeVoterService: AerodromeVoterService,
    private readonly aerodromeWithdrawService: AerodromeWithdrawService,
    private readonly aerodromeSwapperService: AerodromeSwapperService,
    private readonly velodromeService: VelodromeService,
    private readonly velodromeStatsService: VelodromeStatisticsService,
    private readonly velodromeDataService: VelodromeDataService,
    private readonly velodromeClaimerService: VelodromeClaimerService,
    private readonly velodromeDepositService: VelodromeDepositService,
    private readonly velodromeLockerService: VelodromeLockerService,
    private readonly velodromeStakerService: VelodromeStakerService,
    private readonly velodromeVoterService: VelodromeVoterService,
    private readonly velodromeWithdrawService: VelodromeWithdrawService,
    private readonly velodromeSwapperService: VelodromeSwapperService,
    private readonly tokensService: TokensService,
  ) {
    this.getCurrentVotingRound = this.getCurrentVotingRound.bind(this);
    this.getTopRelaysData = this.getTopRelaysData.bind(this);
    this.findPoolsWithFilters = this.findPoolsWithFilters.bind(this);
    this.getStatistics = this.getStatistics.bind(this);

    this.swapArrayBySymbols = this.swapArrayBySymbols.bind(this);
    this.swap = this.swap.bind(this);
    this.getPoolsForVoting = this.getPoolsForVoting.bind(this);
    this.getLiquidityPositions = this.getLiquidityPositions.bind(this);
    this.getWalletRewards = this.getWalletRewards.bind(this);
    this.getTopTokens = this.getTopTokens.bind(this);
    this.addLiquidityToLp = this.addLiquidityToLp.bind(this);
    this.withdrawAMMPoolLiquidity = this.withdrawAMMPoolLiquidity.bind(this);
    this.withdrawCLPoolLiquidity = this.withdrawCLPoolLiquidity.bind(this);
    this.getPositionsByAddress = this.getPositionsByAddress.bind(this);
    this.unstakeLp = this.unstakeLp.bind(this);
    this.stakeLp = this.stakeLp.bind(this);
    this.claimFeeLp = this.claimFeeLp.bind(this);

    this.claimAllRewards = this.claimAllRewards.bind(this);

    this.claimEmissionLp = this.claimEmissionLp.bind(this);

    //lock
    this.getExtendedLocksByAddress = this.getExtendedLocksByAddress.bind(this);
    this.increaseLockTokens = this.increaseLockTokens.bind(this);
    this.lockTokens = this.lockTokens.bind(this);
    this.resetLock = this.resetLock.bind(this);
    this.extendLock = this.extendLock.bind(this);
    this.getLocksByAddress = this.getLocksByAddress.bind(this);
    this.mergeLocks = this.mergeLocks.bind(this);
    this.transferLock = this.transferLock.bind(this);
    this.setLockToRelay = this.setLockToRelay.bind(this);
    this.withdrawLock = this.withdrawLock.bind(this);
    this.claimLockRewards = this.claimLockRewards.bind(this);
    this.claimVotingRewards = this.claimVotingRewards.bind(this);
    this.pokeLock = this.pokeLock.bind(this);

    //vote
    this.vote = this.vote.bind(this);
    this.getWalletBalanceBySymbolForPair =
      this.getWalletBalanceBySymbolForPair.bind(this);
    this.convertTokenValueFromPercentage =
      this.convertTokenValueFromPercentage.bind(this);
    this.convertTokenValueFromUSDValue =
      this.convertTokenValueFromUSDValue.bind(this);
  }

  async getAllTokensInfo(chainId: number): Promise<void> {
    if (chainId === BASE_ID) {
      await this.aerodromeDataService.getDexTokensInfo(chainId);
    } else {
      await this.velodromeDataService.getDexTokensInfo(chainId);
    }
  }

  async getAllData(chainId: number): Promise<void> {
    if (chainId === BASE_ID) {
      await this.aerodromeDataService.getDexData(chainId);
    } else {
      await this.velodromeDataService.getDexData(chainId);
    }
  }

  async getAllEpochsLatest(chainId: number): Promise<void> {
    if (chainId === BASE_ID) {
      await this.aerodromeDataService.getDexEpochsLatest(chainId);
    } else {
      await this.velodromeDataService.getDexEpochsLatest(chainId);
    }
  }

  async swapArrayBySymbols(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    transactions: {
      tokenIn: string;
      tokenOut: string;
      amount: number;
      isAmountIn: boolean;
    }[],
    isSimulation?: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeSwapperService.swapArrayBySymbols(
        user,
        isExternalChat,
        chainId,
        transactions,
        isSimulation,
      );
    }
    return await this.velodromeSwapperService.swapArrayBySymbols(
      user,
      isExternalChat,
      chainId,
      transactions,
      isSimulation,
    );
  }

  async swap(
    user: UserEntity,
    chainId: number,
    tokenIn: ITokenInfo,
    tokenOut: ITokenInfo,
    amount: number,
    isAmountIn: boolean,
    isFromETH = false,
    isToETH = false,
    isSimulation = true,
    isExternalChat = false,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeSwapperService.swap(
        user,
        chainId,
        tokenIn,
        tokenOut,
        amount,
        isAmountIn,
        isFromETH,
        isToETH,
        isSimulation,
        isExternalChat,
      );
    }
    return await this.velodromeSwapperService.swap(
      user,
      chainId,
      tokenIn,
      tokenOut,
      amount,
      isAmountIn,
      isFromETH,
      isToETH,
      isSimulation,
      isExternalChat,
    );
  }

  async addLiquidityToLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    symbol: string,
    tokenIn: string,
    amount: number,
    isSimulation = true,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeDepositService.addLiquidityToLp(
        user,
        isExternalChat,
        chainId,
        symbol,
        tokenIn,
        amount,
        isSimulation,
      );
    }
    return await this.velodromeDepositService.addLiquidityToLp(
      user,
      isExternalChat,
      chainId,
      symbol,
      tokenIn,
      amount,
      isSimulation,
    );
  }

  async getPoolsForVoting(chainId: number) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getPoolsForVoting(chainId);
    }
    return await this.velodromeService.getPoolsForVoting(chainId);
  }

  async getLiquidityPositions(
    chainId: number,
    walletAddress: string,
    type: 'liquidity' | 'staked' | 'unstaked' | null,
    formatResults = true,
    forceUpdate = false,
    blockNumber?: bigint,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getLiquidityPositions(
        chainId,
        walletAddress,
        type,
        formatResults,
        forceUpdate,
        blockNumber,
      );
    }
    return await this.velodromeService.getLiquidityPositions(
      chainId,
      walletAddress,
      type,
      formatResults,
      forceUpdate,
      true,
      blockNumber,
    );
  }

  async getExtendedLocksByAddress(
    chainId: number,
    address: Address,
    type: LockOperations,
    filterLocks: LockFilters,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getExtendedLocksByAddress(
        chainId,
        address,
        type,
        filterLocks,
      );
    } else if (Object.keys(MAP_CHAIN_ID_CHAIN).includes(chainId.toString())) {
      return await this.velodromeService.getExtendedLocksByAddress(
        OPTIMISM_ID,
        address,
        type,
        filterLocks,
      );
    }
  }

  async getLocksByAddress(chainId: number, address: Address) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getLocksByAddress(chainId, address);
    } else if (Object.keys(MAP_CHAIN_ID_CHAIN).includes(chainId.toString())) {
      return await this.velodromeService.getLocksByAddress(
        OPTIMISM_ID,
        address,
      );
    }
  }

  async getWalletRewards(
    chainId: number,
    walletAddress: Address,
    blockNumber?: bigint,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getWalletRewards(
        chainId,
        walletAddress,
        blockNumber,
      );
    }
    return await this.velodromeService.getWalletRewards(
      chainId,
      walletAddress,
      true,
      blockNumber,
    );
  }

  async getTopTokens(params: {
    chainId: number;
    filters: Partial<Record<keyof IToken, any>> | undefined;
    orderBy: 'price' | 'market_cap' | 'volume_24h' | null;
    sortOrder: 'asc' | 'desc';
    limit: number | undefined;
  }) {
    if (params?.chainId === BASE_ID) {
      return await this.aerodromeService.getTopTokens(params);
    }
    return await this.velodromeService.getTopTokens(params);
  }

  async withdrawAMMPoolLiquidity(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    amount: number,
    amountType: WithdrawAmountTypeEnum,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeWithdrawService.withdrawAMMPoolLiquidity(
        user,
        isExternalChat,
        chainId,
        poolSymbol,
        amount,
        amountType,
        isSimulation,
      );
    }
    return await this.velodromeWithdrawService.withdrawAMMPoolLiquidity(
      user,
      isExternalChat,
      chainId,
      poolSymbol,
      amount,
      amountType,
      isSimulation,
    );
  }

  async withdrawCLPoolLiquidity(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    amountType: WithdrawAmountTypeEnum,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeWithdrawService.withdrawCLPoolLiquidity(
        user,
        isExternalChat,
        chainId,
        poolSymbol,
        positionId,
        amount,
        amountType,
        isSimulation,
      );
    }
    return await this.velodromeWithdrawService.withdrawCLPoolLiquidity(
      user,
      isExternalChat,
      chainId,
      poolSymbol,
      positionId,
      amount,
      amountType,
      isSimulation,
    );
  }

  async getPositionsByAddress(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    type: ActionType,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeService.getPositionsByAddress(
        user,
        isExternalChat,
        chainId,
        type,
      );
    }
    return await this.velodromeService.getPositionsByAddress(
      user,
      isExternalChat,
      chainId,
      type,
    );
  }

  async stakeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeStakerService.stakeLp(
        user,
        isExternalChat,
        chainId,
        poolSymbol,
        positionId,
        amount,
        isSimulation,
      );
    }
    return await this.velodromeStakerService.stakeLp(
      user,
      isExternalChat,
      chainId,
      poolSymbol,
      positionId,
      amount,
      isSimulation,
    );
  }

  async unstakeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    poolSymbol: string,
    positionId: string,
    amount: number,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeStakerService.unstakeLp(
        user,
        isExternalChat,
        chainId,
        poolSymbol,
        positionId,
        amount,
        isSimulation,
      );
    }
    return await this.velodromeStakerService.unstakeLp(
      user,
      isExternalChat,
      chainId,
      poolSymbol,
      positionId,
      amount,
      isSimulation,
    );
  }

  async claimFeeLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: { poolSymbol: string; positionId: string }[],
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeClaimerService.claimFeeLp(
        user,
        isExternalChat,
        chainId,
        positions,
        isSimulation,
      );
    }
    return await this.velodromeClaimerService.claimFeeLp(
      user,
      isExternalChat,
      chainId,
      positions,
      isSimulation,
    );
  }

  async claimEmissionLp(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: { poolSymbol: string; positionId: string }[],
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeClaimerService.claimEmissionLp(
        user,
        isExternalChat,
        chainId,
        positions,
        isSimulation,
      );
    }
    return await this.velodromeClaimerService.claimEmissionLp(
      user,
      isExternalChat,
      chainId,
      positions,
      isSimulation,
    );
  }

  async claimAllRewards(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    positions: { poolSymbol: string; positionId: string }[],
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeClaimerService.claimAllRewards(
        user,
        isExternalChat,
        chainId,
        positions,
        isSimulation,
      );
    }
    return await this.velodromeClaimerService.claimAllRewards(
      user,
      isExternalChat,
      chainId,
      positions,
      isSimulation,
    );
  }

  async increaseLockTokens(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      lockId: string;
      amount: number;
      isSimulation: boolean;
      token: 'AERO' | 'VELO';
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.increaseLockTokens(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeLockerService.increaseLockTokens(
      user,
      isExternalChat,
      args,
    );
  }

  async lockTokens(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      amount: number;
      token: 'AERO' | 'VELO';
      isSimulation: boolean;
      lockUntilCurrentEpoch: true;
      duration?: number;
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.lockTokens(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeLockerService.lockTokens(
      user,
      isExternalChat,
      args,
    );
  }

  async resetLock(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      lockId: number;
      isSimulation: boolean;
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.resetLock(user, args);
    }

    return await this.velodromeLockerService.resetLock(user, args);
  }

  async extendLock(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      duration: number;
      token: 'AERO' | 'VELO';
      isSimulation: boolean;
      lockId: string;
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.extendLock(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeLockerService.extendLock(
      user,
      isExternalChat,
      args,
    );
  }

  async mergeLocks(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      fromLockId: string;
      toLockId: string;
      isSimulation: boolean;
      token: 'AERO' | 'VELO';
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.mergeLocks(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeLockerService.mergeLocks(
      user,
      isExternalChat,
      args,
    );
  }

  async transferLock(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      chainId: number;
      lockId: string;
      isSimulation: boolean;
      token: 'AERO' | 'VELO';
      toAddress: Address;
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.transferLock(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeLockerService.transferLock(
      user,
      isExternalChat,
      args,
    );
  }

  async withdrawLock(user, isExternalChat, args) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.withdrawLock(
        user,
        isExternalChat,

        args,
      );
    }
    return await this.velodromeLockerService.withdrawLock(
      user,
      isExternalChat,
      args,
    );
  }

  async claimLockRewards(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      lockList: string[];
      isSimulation: boolean;
      token: 'AERO' | 'VELO';
      chainId: number;
    },
  ) {
    if (args.chainId === BASE_ID) {
      return await this.aerodromeLockerService.claimLockRewards(
        user,
        isExternalChat,
        args,
      );
    }

    return await this.velodromeLockerService.claimLockRewards(
      user,
      isExternalChat,
      args,
    );
  }

  async vote(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    pools: { symbol: string; power: string }[],
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeVoterService.vote(
        user,
        isExternalChat,
        chainId,
        lockId,
        pools,
        isSimulation,
      );
    }
    return await this.velodromeVoterService.vote(
      user,
      isExternalChat,
      chainId,
      lockId,
      pools,
      isSimulation,
    );
  }

  async setLockToRelay(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    relayId: string,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeLockerService.setLockToRelay(
        user,
        isExternalChat,
        chainId,
        lockId,
        relayId,
        isSimulation,
      );
    }
    return await this.velodromeLockerService.setLockToRelay(
      user,
      isExternalChat,
      chainId,
      lockId,
      relayId,
      isSimulation,
    );
  }

  async pokeLock(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    isSimulation: boolean,
  ) {
    if (chainId === BASE_ID) {
      return await this.aerodromeLockerService.pokeLock(
        user,
        isExternalChat,
        chainId,
        lockId,
        isSimulation,
      );
    }
    return await this.velodromeLockerService.pokeLock(
      user,
      isExternalChat,
      chainId,
      lockId,
      isSimulation,
    );
  }

  async findPoolsWithFilters({
    chains,
    filters = undefined,
    orderBy = null,
    sortOrder = 'desc',
    limit = 5,
  }: {
    chains: string[];
    filters: IPoolsFilter | undefined;
    orderBy: keyof PoolData | null;
    sortOrder: 'asc' | 'desc';
    limit: number | undefined;
  }): Promise<{ total: number; pools: PoolData[] }> {
    if (chains?.length > 0) {
      let newTotal = 0;
      let totalPools: PoolData[] = [];

      const promises = chains.map(async (chainKey) => {
        const chainId = Number(chainKey);
        if (chainId === BASE_ID) {
          return await this.aerodromeStatsService.findPoolsWithFilters({
            chainId,
            filters,
            orderBy,
            sortOrder,
            limit,
          });
        } else {
          return await this.velodromeStatsService.findPoolsWithFilters({
            chainId,
            filters,
            orderBy,
            sortOrder,
            limit,
          });
        }
      });

      (await Promise.all(promises)).flat().forEach(({ total, pools }) => {
        newTotal += total;
        totalPools.push(...pools);
      });

      if (orderBy && totalPools.length > 0) {
        totalPools = totalPools.sort((a, b) => {
          const aValue = a[orderBy];
          const bValue = b[orderBy];

          if (
            orderBy === 'liquidity' ||
            orderBy === 'tvl' ||
            orderBy === 'apr' ||
            orderBy === 'vApr' ||
            orderBy === 'volume' ||
            orderBy === 'reserve0' ||
            orderBy === 'reserve1' ||
            orderBy === 'staked0' ||
            orderBy === 'staked1' ||
            orderBy === 'pool_fee' ||
            orderBy === 'votes' ||
            orderBy === 'reserveInUsd0' ||
            orderBy === 'reserveInUsd1'
          ) {
            return sortOrder === 'asc'
              ? (Number(aValue?.toString()) || 0) -
                  (Number(bValue?.toString()) || 0)
              : (Number(bValue?.toString()) || 0) -
                  (Number(aValue?.toString()) || 0);
          }

          if (aValue === undefined || bValue === undefined) return 0;
          if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortOrder === 'asc' ? +aValue - +bValue : +bValue - +aValue;
          }

          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortOrder === 'asc'
              ? aValue.localeCompare(bValue)
              : bValue.localeCompare(aValue);
          }

          return 0;
        });
      }

      if (limit) {
        totalPools = totalPools.slice(0, limit);
      }

      return { total: newTotal, pools: totalPools };
    } else {
      return { total: 0, pools: [] };
    }
  }

  async getCurrentVotingRound(chainId: number) {
    if (chainId === BASE_ID) {
      return await this.aerodromeStatsService.getCurrentVotingRound(chainId);
    }
    return await this.velodromeStatsService.getCurrentVotingRound(chainId);
  }

  async getTopRelaysData(chainId: number, address: Address) {
    if (chainId === BASE_ID) {
      return await this.aerodromeStatsService.getTopRelaysData(
        chainId,
        address,
      );
    }
    return await this.velodromeStatsService.getTopRelaysData(chainId, address);
  }

  async getStatistics(chainIds: number[]) {
    if (chainIds.includes(BASE_ID)) {
      return await this.aerodromeStatsService.getStatistics(BASE_ID);
    }
    return await this.velodromeStatsService.getStatistics(chainIds);
  }

  async getRebaseAprs() {
    const chains = [BASE_ID, OPTIMISM_ID];
    const rebaseDataArray = await Promise.all(
      chains.map(async (chainId) => {
        if (chainId === BASE_ID) {
          return await this.aerodromeStatsService.getRebaseApr(chainId);
        } else {
          return await this.velodromeStatsService.getRebaseApr(chainId);
        }
      }),
    );

    const rebaseAprs = rebaseDataArray.map((data) => new RebaseAprDto(data));
    return { rebaseAprs };
  }

  async getPoolsByAddresses(dto: GetPoolsBodyDto): Promise<PoolResponseDto[]> {
    const uniqueChainIds = Array.from(
      new Set(dto.addresses.map((a) => a.chainId)),
    );

    const poolsByChain = await Promise.all(
      uniqueChainIds.map(async (chainId) => {
        const cacheKey = getPoolsDataKey(chainId);
        const pools = await this.cacheService.get<PoolData[]>(cacheKey);
        return { chainId, pools: pools || [] };
      }),
    );

    const allPools: (PoolData & { chainId: number })[] = poolsByChain.flatMap(
      (item) => item.pools.map((pool) => ({ ...pool, chainId: item.chainId })),
    );

    const filteredPools = allPools.filter((pool) =>
      dto.addresses.some(
        (addr) =>
          pool.chainId === addr.chainId &&
          pool.lp.toLowerCase() === addr.address.toLowerCase(),
      ),
    );

    return filteredPools.map((p) => new PoolResponseDto(p)) || [];
  }

  async getTokensInfo(chains: number[]): Promise<TokenResponseDto[]> {
    const tokensArrays = await Promise.all(
      chains.map(async (chainId) => {
        const tokens =
          (await this.cacheService.get<TokenResponse[]>(
            getTokenInfoKey(chainId),
          )) || [];
        return tokens
          .filter((token) => token.listed)
          .map((token) => new TokenResponseDto(token));
      }),
    );

    return tokensArrays.flat();
  }

  async getPositionsSummary(dto: PositionsSummaryBodyDto) {
    const wallet = dto.walletAddress;
    let chainIds = dto.chains;

    chainIds = intersectionWith(
      chainIds,
      Object.keys(MAP_CHAIN_ID_CHAIN).map((c) => +c),
    ); // TODO delete in future

    const summaries = await Promise.all(
      chainIds.map(async (chainId) => {
        if (chainId === BASE_ID) {
          return await this.aerodromeService.getPositionsSummary(
            chainId,
            wallet,
          );
        }
        return await this.velodromeService.getPositionsSummary(chainId, wallet);
      }),
    );

    const aggregated: PositionsSummaryResponseDto = {
      staked: summaries.reduce((sum, s) => sum + s.staked, 0),
      unstaked: summaries.reduce((sum, s) => sum + s.unstaked, 0),
      totalDepositedCurrent: summaries.reduce(
        (sum, s) => sum + s.totalDepositedCurrent,
        0,
      ),
      totalDeposited24hAgo: summaries.reduce(
        (sum, s) => sum + s.totalDeposited24hAgo,
        0,
      ),
      stakedReward: summaries.reduce((sum, s) => sum + s.stakedReward, 0),
      tradingFee: summaries.reduce((sum, s) => sum + s.tradingFee, 0),
      votingReward: summaries.reduce((sum, s) => sum + s.votingReward, 0),
      profits: summaries.reduce((sum, s) => sum + s.profits, 0),
      profits24hAgo: summaries.reduce((sum, s) => sum + s.profits24hAgo, 0),
    };

    return aggregated;
  }

  async claimVotingRewards(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      votesIds: number[];
      isSimulation: boolean;
      chainId: number;
    },
  ) {
    if (+args.chainId === BASE_ID) {
      return await this.aerodromeVoterService.claimVotingRewards(
        user,
        isExternalChat,
        args,
      );
    }
    return await this.velodromeVoterService.claimVotingRewards(
      user,
      isExternalChat,
      args,
    );
  }

  async getWalletBalanceBySymbolForPair({
    walletAddress,
    token1RequiredUsdAmount,
    token1Symbol,
    token2RequiredUsdAmount,
    token2Symbol,
    chainId,
  }: {
    token1UsdBalance: number;
    token1RequiredUsdAmount: number;
    token1Symbol: string;
    token2UsdBalance: number;
    token2RequiredUsdAmount: number;
    token2Symbol: string;
    walletAddress: Address;
    chainId: number;
  }) {
    const token1Balance = await this.tokensService.getBalanceByTokenSymbol(
      walletAddress,
      token1Symbol,
      chainId,
    );
    const token2Balance = await this.tokensService.getBalanceByTokenSymbol(
      walletAddress,
      token2Symbol,
      chainId,
    );

    if (!token1Balance)
      return new Error(`Can not find token with symbol ${token1Symbol}`);
    if (!token2Balance)
      return new Error(`Can not find token with symbol ${token2Symbol}`);

    const missingAmounts: Record<string, number> = {};

    const missingToken1 = token1RequiredUsdAmount - token1Balance.usdValue;
    const missingToken2 = token2RequiredUsdAmount - token2Balance.usdValue;

    if (missingToken1 > 0) {
      missingAmounts[token1Symbol] = Math.ceil(missingToken1 * 100) / 100;
    }

    if (missingToken2 > 0) {
      missingAmounts[token2Symbol] = Math.ceil(missingToken2 * 100) / 100;
    }

    return {
      token1Balance,
      token2Balance,
      insufficientAmountsForSwapInUsd: missingAmounts,
      isAllBalancesSufficient: Object.keys(missingAmounts).length === 0,
    };
  }

  async convertTokenValueFromPercentage(
    tokenSymbol: string,
    percentage: number,
    walletAddress: Address,
    chainId: number,
  ) {
    const tokenInfoWithBalance =
      await this.tokensService.getBalanceByTokenSymbol(
        walletAddress,
        tokenSymbol,
        chainId,
      );

    if (!tokenInfoWithBalance?.usdValue) {
      return `Can not find USD balance for token ${tokenSymbol}`;
    }
    return {
      convertedTokenAmountValue:
        tokenInfoWithBalance.balance * (percentage / 100),
    };
  }

  async convertTokenValueFromUSDValue(
    tokenSymbol: string,
    amountInUSD: number,
    chainId: number,
  ) {
    const tokenInfo = await this.tokensService.getTokenBySymbol(
      tokenSymbol,
      chainId,
    );

    if (!tokenInfo?.price) {
      return `Can not find price for token ${tokenSymbol}`;
    }
    return {
      convertedTokenAmountValue: amountInUSD / tokenInfo?.price,
    };
  }
}
