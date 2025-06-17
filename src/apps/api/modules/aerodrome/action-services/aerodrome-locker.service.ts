import { Injectable, Logger } from '@nestjs/common';
import { UserEntity } from '../../users/entities/user.entity';
import { isBoolean, isNumber, isPositive, isString } from 'class-validator';
import {
  Address,
  erc20Abi,
  erc721Abi,
  formatEther,
  formatUnits,
  isAddress,
  parseUnits,
} from 'viem';
import { TLock, TokenResponse } from '../../../../../common/types';
import { getTokenInfoKey } from '../../cache/constants/keys';
import { formatNumber } from '../../../../../common/utils/round-number';
import { yamlConfig } from '../../../../../common/configs/yaml.config';
import { IIncreaseLock } from '../../../../../common/interfaces/actions/increase-lock.interface';
import { DAY, SECOND, WEEK, YEAR } from '../../../../../common/constants/time';
import { ICreateLock } from '../../../../../common/interfaces/actions/create-lock.iterface';
import { IExtendLock } from '../../../../../common/interfaces/actions/extend-lock.interface';
import { IMergeLocks } from '../../../../../common/interfaces/actions/merge-locks.interface';
import { ITransferLock } from '../../../../../common/interfaces/actions/transfer-lock.interface';
import { AerodromeService } from '../aerodrome.service';
import { ViemService } from '../../viem/viem.service';
import { CacheService } from '../../cache/cache.service';
import { PrivyService } from '../../privy/privy.service';
import { AerodromeStatisticsService } from '../aerodrome-statistics.service';
import { TokensService } from '../../tokens/tokens.service';
import { getTransactionReceipt, readContract } from 'viem/actions';
import { chainsConfig } from '../../../../../common/constants/chains';
import { veNftAbi } from '../../../../../common/constants/chains/abis/ve-nft.abi';
import { voterAbi } from '../../../../../common/constants/chains/abis/voter.abi';
import { MAP_CHAIN_ID_CHAIN } from '../../viem/constants';
import { formatDuration, intervalToDuration } from 'date-fns';
import { IWithdrawLock } from '../../../../../common/interfaces/actions/withdraw-lock.interface';
import { IClaimLock } from '../../../../../common/interfaces/actions/claim-lock.interface';
import { getSwapperAbiViaChain } from '../../../../../common/utils/get-swapper-abi-via-chain';
import {
  LockFilters,
  LockOperations,
} from '../../openai/tools-description/types';
import { IResetLock } from 'src/common/interfaces/actions/reset-lock.interface';

@Injectable()
export class AerodromeLockerService {
  private readonly logger = new Logger(AerodromeLockerService.name);

  private readonly LOCK_MIN_DURATION_DAYS = 1;
  private readonly EXTEND_LOCK_MIN_DAYS = 7;
  private readonly LOCK_MAX_DURATION_DAYS = 1460; // 4 years

  constructor(
    private readonly aerodromeService: AerodromeService,
    private readonly viemService: ViemService,
    private readonly cacheService: CacheService,
    private readonly tokensService: TokensService,
    private readonly privyService: PrivyService,
    private readonly aerodromeStatsService: AerodromeStatisticsService,
  ) {}

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
    const increaseIdForLogs = `${user.id}_${crypto.randomUUID()}`;
    const { lockId, amount, isSimulation, token, chainId } = args;

    this.logger.log(
      `[Increase Lock Tokens: ${increaseIdForLogs}]: Starting increase lock tokens process`,
    );

    try {
      if (
        !isBoolean(isSimulation) ||
        !isNumber(amount) ||
        !isPositive(amount) ||
        !isString(token) ||
        token.toUpperCase() !== 'AERO'
      ) {
        this.logger.error(
          `[Increase Lock Tokens: ${increaseIdForLogs}]: Invalid arguments`,
        );

        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      const viemClient = this.viemService.getViemClient(chainId);

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(
          `[Increase Lock Tokens: ${increaseIdForLogs}]: Invalid wallet {${walletAddress}}`,
        );

        throw new Error(`User wallet ${walletAddress} not found `);
      }

      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );

      if (!userLocks.find((lock) => lock.id.toString() === lockId)) {
        this.logger.error(
          `[Increase Lock Tokens: ${increaseIdForLogs}]: Lock with id${lockId} not found`,
        );

        throw new Error(`Lock with id ${lockId} not found`);
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        this.logger.error(
          `[Increase Lock Tokens: ${increaseIdForLogs}]: NO tokens in cache`,
        );
        throw new Error('Tokens info not found');
      }

      const tokenInfo = tokensInfoList?.find(
        (t) => t.symbol.toUpperCase() === token.toUpperCase(),
      );

      if (!tokenInfo) {
        this.logger.error(
          `[Increase Lock Tokens: ${increaseIdForLogs}]: Token ${token} not found`,
        );

        throw new Error(`Token ${token} not found`);
      }

      const tokenBalance = await this.tokensService.getBalanceByTokenSymbol(
        walletAddress,
        token,
        chainId,
      );

      this.logger.log(
        `[Lock Tokens: ${lockId}]: ${token} Balance: ${tokenBalance}`,
      );

      const amountBn = parseUnits(amount.toString(), tokenInfo.decimals);
      const amountUsd = amount * Number(tokenInfo.price || 0);
      const balanceBn = parseUnits(
        tokenBalance?.balance.toString() || '0',
        tokenInfo.decimals,
      );

      if (balanceBn < amountBn) {
        throw new Error(`Insufficient ${token} balance`);
      }

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice; //TODO:
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
      const gasFormatted = formatEther(gasBn);

      const { feeBn, fee } = this.aerodromeService.calculateFee(
        amount,
        Number(tokenInfo.price || '0'),
        ethPrice,
        yamlConfig.FEE_DETAILS.FEE_PCT,
        viemClient.chain.nativeCurrency.decimals,
      );

      if (fee <= 0) {
        this.logger.error(`
               [Increase Lock Tokens: ${increaseIdForLogs}]: fee calc crush  => fee :${fee} ,feeBn: ${feeBn} 
          `);

        throw new Error(
          'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
        );
      }

      const amountToApproveBn =
        amountBn + BigInt(Math.trunc(+amountBn.toString() * 0.001));

      const lockData: IIncreaseLock = {
        walletAddress,
        feeBn,
        amountBn,
        token_address: tokenInfo.token_address,
        amountToApproveBn,
        lockId,
      };

      if (isSimulation) {
        return {
          isSimulation,
          lockId,
          gasBn,
          amount,
          gasFormatted,
          amountUsd,
          gasUSD: Number(gasUSD).toFixed(2),
          success: true,
          chainId,
        };
      }

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyIncreaseLock(chainId, lockData);
      }

      return {
        success: true,
        action: 'increaseLock',
        isSimulation,
        ...lockData,
        chainId,
      };
    } catch (err) {
      this.logger.error(
        `[Increase Lock Tokens: ${increaseIdForLogs}]: ${err.message}`,
        err.stack,
      );

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
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
    const lockId = `${user.id}_${crypto.randomUUID()}`;

    this.logger.log(`[Lock Tokens: ${lockId}]: Starting lock tokens process`);

    const {
      duration: durationInDays,
      amount,
      token,
      isSimulation,
      chainId,
      lockUntilCurrentEpoch,
    } = args;

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (
        !isBoolean(isSimulation) ||
        !isNumber(amount) ||
        !isString(token) ||
        token.toUpperCase() !== 'AERO' ||
        !isNumber(durationInDays)
      ) {
        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      if (!lockUntilCurrentEpoch) {
        if (!isNumber(durationInDays)) {
          throw new Error(
            'Duration (in days) must be provided when locking until next epoch.',
          );
        }
        if (
          durationInDays < this.LOCK_MIN_DURATION_DAYS ||
          durationInDays > this.LOCK_MAX_DURATION_DAYS
        ) {
          this.logger.log(
            `[Lock Tokens: ${lockId}]: Lock duration cannot be less than ${this.LOCK_MIN_DURATION_DAYS} days and more than 4 years`,
          );
          throw new Error(
            `Lock duration cannot be less than ${this.LOCK_MIN_DURATION_DAYS} days and more than 4 years.`,
          );
        }
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        throw new Error('User wallet not found');
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        throw new Error('Tokens info not found');
      }

      const tokenInfo = tokensInfoList?.find(
        (t) => t.symbol.toUpperCase() === token.toUpperCase(),
      );

      if (!tokenInfo) {
        throw new Error(`Token ${token} not found`);
      }

      const tokenBalance = await this.tokensService.getBalanceByTokenSymbol(
        walletAddress,
        token,
        chainId,
      );

      this.logger.log(
        `[Lock Tokens: ${lockId}]: ${token} Balance: ${tokenBalance}`,
      );

      const amountBn = parseUnits(amount.toString(), tokenInfo.decimals);
      const balanceBn = parseUnits(
        tokenBalance?.balance.toString() || '0',
        tokenInfo.decimals,
      );

      if (balanceBn < amountBn) {
        throw new Error(`Insufficient ${token} balance`);
      }

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      const { feeBn } = this.aerodromeService.calculateFee(
        amount,
        Number(tokenInfo.price || '0'),
        ethPrice,
        yamlConfig.FEE_DETAILS.FEE_PCT,
        viemClient.chain.nativeCurrency.decimals,
      );

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice;
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));
      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });

      const currentEpochData =
        await this.aerodromeStatsService.getCurrentVotingRound(chainId);
      const currentEpochLeft = this.getCurrentEpochTs(
        new Date(currentEpochData.endsAt),
      );

      let calculatedDuration: number;
      if (lockUntilCurrentEpoch) {
        if (currentEpochLeft < 60 * 60 * 1000) {
          throw new Error(
            'The current epoch ends in less than 1 hour. Please choose to lock until the next epoch.',
          );
        }
        calculatedDuration = currentEpochLeft;
      } else {
        const durationTs = durationInDays * DAY;
        const estimatedDurationInWeeks = Math.ceil(durationTs / WEEK);

        if (estimatedDurationInWeeks < 1) {
          throw new Error('Wrong duration');
        }

        calculatedDuration =
          estimatedDurationInWeeks === 1
            ? currentEpochLeft
            : currentEpochLeft + (estimatedDurationInWeeks - 1) * WEEK;
      }

      const start = new Date();
      const end = new Date(Date.now() + calculatedDuration);

      const duration = intervalToDuration({
        start,
        end,
      });

      const endsIn = formatDuration(duration, {
        format: ['years', 'months', 'days', 'hours'],
      });

      const warningMessages: string[] = [
        lockUntilCurrentEpoch
          ? `
        This epoch will end at ${currentEpochData.endInMs}. 
        Duration time will be automatically adjusted to the end of the current epoch.
        `
          : `
        This epoch will end at ${currentEpochData.endInMs}.
        End of epoch: If you choose a duration that extends beyond the current epoch, your lock will end at the beginning of the next epoch.
        Automatic adjustment: If you choose a duration that does not match the end of the epoch, the system automatically adjusts the duration to match the current cycle.
        `,
      ];

      if (isSimulation) {
        return {
          isSimulation,
          duration: endsIn,
          gasBn,
          amount,
          gasUSD,
          success: true,
          warningMessages,
          chainId,
        };
      }

      const amountToApproveBn =
        amountBn + BigInt(Math.trunc(+amountBn.toString() * 0.001));

      const recalculatedTimeInSec = calculatedDuration / SECOND;
      const recalculatedTimeInBigInt = BigInt(
        Math.floor(recalculatedTimeInSec),
      );

      const lockData: ICreateLock = {
        walletAddress,
        feeBn,
        amountBn,
        duration: recalculatedTimeInBigInt,
        token_address: tokenInfo.token_address,
        amountToApproveBn,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyLockTokens(chainId, lockData);
      }

      return {
        success: true,
        action: 'lockTokens',
        isSimulation,
        ...lockData,
        chainId,
      };
    } catch (err) {
      this.logger.error(`[Lock Tokens: ${lockId}]: ${err.message}`, err.stack);

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
  }

  async resetLock(
    user: UserEntity,
    args: {
      chainId: number;
      lockId: number;
      isSimulation: boolean;
    },
  ) {
    const { chainId, lockId, isSimulation } = args;

    try {
      const idForLogs = `${user.id}_${crypto.randomUUID()}`;
      this.logger.log(
        `[RESET Tokens: ${idForLogs}]:Starting resetting lock ${lockId} process`,
      );
      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        throw new Error('User wallet not found');
      }

      const res = await this.aerodromeService.getExtendedLocksByAddress(
        chainId,
        walletAddress,
        LockOperations.ResetLock,
        LockFilters.Default,
      );

      const targetLock = res?.locks.find(
        (lock) => Number(lock.id) === Number(lockId),
      );

      if (!targetLock)
        throw new Error(`Lock with id ${lockId} can not be reset`);

      const resetLockData: IResetLock = {
        walletAddress,
        lockId,
      };

      if (isSimulation) {
        return {
          isSimulation,
          success: true,
          chainId,
          ...resetLockData,
        };
      }

      return {
        success: true,
        action: 'resetLock',
        isSimulation,
        chainId,
        ...resetLockData,
      };
    } catch (err) {
      this.logger.error(`[Reset lock: ${lockId}]: ${err.message}`, err.stack);

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
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
    const logId = `${user.id}_${crypto.randomUUID()}`;

    const { lockId, isSimulation, token, duration, chainId } = args;

    this.logger.log(
      `[EXTEND Lock: ${logId}]: Starting extend lock tokens process`,
    );

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (
        !isBoolean(isSimulation) ||
        !isNumber(duration) ||
        !isString(lockId) ||
        !isString(token) ||
        token.toUpperCase() !== 'AERO' ||
        duration < this.EXTEND_LOCK_MIN_DAYS ||
        duration > this.LOCK_MAX_DURATION_DAYS
      ) {
        this.logger.error(`[EXTEND Lock: ${lockId}]: Invalid arguments`);

        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(
          `[EXTEND Lock: ${lockId}]: Invalid wallet {${walletAddress}}`,
        );

        throw new Error(`User wallet ${walletAddress} not found `);
      }

      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );

      const targetLock = userLocks.find(
        (lock) => lock.id.toString() === lockId,
      );

      if (!targetLock) {
        this.logger.error(
          `[EXTEND Lock: ${lockId}]: Lock with id${lockId} not found`,
        );

        throw new Error(`Lock with id ${lockId} not found`);
      }

      //- NOTE: Extending an Auto Max-Lock is not allowed.
      if (targetLock.permanent) {
        this.logger.error('Extending an Auto Max-Lock is not allowed');
        throw new Error('Extending an Auto Max-Lock is not allowed');
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        this.logger.error(`[EXTEND Lock: ${lockId}]: NO tokens in cache`);
        throw new Error('Tokens info not found');
      }

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice; //TODO:
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
      const gasFormatted = formatEther(gasBn);

      const currentTimestampInSeconds = Math.floor(Date.now() / SECOND);

      const currentDurationInDays = Math.floor(
        (Number(targetLock.expires_at) - currentTimestampInSeconds) / 86400,
      );

      if (Number(targetLock.expires_at) < currentTimestampInSeconds) {
        this.logger.error(
          `[EXTEND Lock: ${lockId}]: Can not extend expired lock ${lockId}`,
        );

        throw new Error(`Can not extend expired lock ${lockId}`);
      }

      const expectedDurationInDays = currentDurationInDays + duration;
      const ceilWeeks = Math.ceil((expectedDurationInDays * DAY) / WEEK);
      let estimateDuractionInDays = (ceilWeeks * WEEK) / DAY;

      const warningMessages: string[] = [];
      const FOUR_YEARS = YEAR * 4;

      if (estimateDuractionInDays * DAY > FOUR_YEARS) {
        this.logger.warn(
          `[EXTEND Lock: ${lockId}]: Estimated duration is more than 4 years.`,
        );

        estimateDuractionInDays = FOUR_YEARS / DAY - currentDurationInDays;
        warningMessages.push('Estimated duration is more than 4 years.');
      }

      if (isSimulation) {
        return {
          isSimulation,
          lockId,
          gasBn,
          gasFormatted,
          currentDurationInDays,
          estimateDuractionInDays: duration + currentDurationInDays,
          gasUSD: Number(gasUSD).toFixed(2),
          success: true,
          warningMessages,
          chainId,
        };
      }

      const lockData: IExtendLock = {
        walletAddress,
        duration: BigInt((estimateDuractionInDays * DAY) / SECOND),
        lockId,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyExtendLock(chainId, lockData);
      }

      return {
        success: true,
        action: 'extendLock',
        isSimulation,
        ...lockData,
        chainId,
      };
    } catch (err) {
      this.logger.error(`[EXTEND Lock: ${lockId}]: ${err.message}`, err.stack);

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
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
    const logId = `${user.id}_${crypto.randomUUID()}`;

    const { fromLockId, toLockId, isSimulation, token, chainId } = args;

    this.logger.log(`[Merge Locks: ${logId}]: Starting merge locks process`);

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (
        !isBoolean(isSimulation) ||
        !isString(token) ||
        token.toUpperCase() !== 'AERO' ||
        !isString(fromLockId) ||
        !isString(toLockId)
      ) {
        this.logger.error(`[Merge Locks: ${logId}]: Invalid arguments`);
        throw new Error('Check arguments and try again');
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(`[Merge Locks: ${logId}]: User wallet not found`);

        throw new Error('User wallet not found');
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        this.logger.error(`[Merge Locks: ${logId}]: no tokens in cache`);

        throw new Error('Tokens info not found');
      }

      const tokenInfo = tokensInfoList?.find(
        (t) => t.symbol.toUpperCase() === token.toUpperCase(),
      );

      if (!tokenInfo) {
        this.logger.error(`[Merge Locks: ${logId}]: Token ${token} not founds`);

        throw new Error(`Token ${token} not found`);
      }

      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );
      const from = userLocks.find((lock) => lock.id.toString() === fromLockId);
      const to = userLocks.find((lock) => lock.id.toString() === toLockId);

      if (!from || !to) {
        const errorMessage = `${
          !from ? `lock with id ${fromLockId} not found` : ''
        }
          ${!to ? `lock with id ${toLockId} not found` : ''}
        `;
        this.logger.error(`[Merge Locks: ${logId}]: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      if (!to.permanent) this.checkLockExpireTime(to);

      if (from === to) {
        this.logger.error("Can't merge same lock");
        throw new Error("Can't merge same lock");
      }

      if (from.votes.length > 0) {
        this.logger.error(
          `Can't merge lock #${fromLockId} with votes. Please rebase first`,
        );
        throw new Error(
          `Can't merge lock #${fromLockId} with votes. Please rebase first`,
        );
      }

      // -merge locks relayed to  is not allowed
      if (
        from.managed_id.toString() !== '0' ||
        to.managed_id.toString() !== '0'
      ) {
        this.logger.error("Can't merge locks with Relays");
        throw new Error("Can't merge locks with Relays");
      }

      //- NOTE: Merging  is not allowed when "from" an Auto Max-Lock mode
      if (from.permanent) {
        this.logger.error('Merging an Auto Max-Lock is not allowed');
        throw new Error('Merging an Auto Max-Lock is not allowed');
      }

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );
      const amount = Number(from.amount + to.amount);

      const ethPrice = +(ethToken?.price || 0);

      const { feeBn, fee } = this.aerodromeService.calculateFee(
        +formatUnits(BigInt(amount), +tokenInfo.decimals || 0),
        Number(tokenInfo.price || '0'),
        ethPrice,
        yamlConfig.FEE_DETAILS.FEE_PCT,
        viemClient.chain.nativeCurrency.decimals,
      );

      if (fee <= 0) {
        this.logger.error(`
               [Merge Lock Tokens: ${logId}]: fee calc crush  => fee: ${fee}, feeBn: ${feeBn} 
          `);

        throw new Error(
          'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
        );
      }

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice;
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });

      const longestDuration = Math.max(
        Number(from.expires_at),
        Number(to.expires_at),
      );

      const currentTimestamp = Math.floor(Date.now() / SECOND);

      const estimatedDurationInDays = Math.floor(
        ((longestDuration - currentTimestamp) * SECOND) / DAY,
      );

      if (isSimulation) {
        return {
          isSimulation,
          symbol: tokenInfo.symbol,
          lock1: from,
          lock2: to,
          estimatedDuration: estimatedDurationInDays,
          gasBn,
          estimatedAmount: amount,
          gasUSD,
          warningMessages: [
            `Merging two locks will inherit the longest lock time of the two and will increase the final Lock (veNFT)
        voting power by adding up the two underlying locked amounts based on the new lock time.`,
          ],
          chainId,
          success: true,
        };
      }

      const mergeLockData: IMergeLocks = {
        walletAddress,
        feeBn,
        lockIds: [BigInt(fromLockId), BigInt(toLockId)],
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyMergeLocks(chainId, mergeLockData);
      }

      return {
        success: true,
        action: 'mergeLocks',
        isSimulation,
        ...mergeLockData,
        chainId,
      };
    } catch (error) {
      this.logger.error(
        `[Merge Locks: ${logId}]: ${error.message}`,
        error.stack,
      );

      return {
        success: false,
        isSimulation,
        message: error.message,
      };
    }
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
    const logId = `${user.id}_${crypto.randomUUID()}`;

    const { lockId, isSimulation, token, toAddress, chainId } = args;

    this.logger.log(
      `[TRANSFER Lock: ${logId}]: Starting transfer lock tokens process`,
    );

    const viemClient = this.viemService.getViemClient(chainId);

    try {
      if (
        !isBoolean(isSimulation) ||
        !isString(toAddress) ||
        !isAddress(toAddress) ||
        !isString(lockId) ||
        !isString(token) ||
        token.toUpperCase() !== 'AERO'
      ) {
        this.logger.error(`[TRANSFER Lock: ${lockId}]: Invalid arguments`);

        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(
          `[TRANSFER Lock: ${lockId}]: Invalid wallet {${walletAddress}}`,
        );

        throw new Error(`User wallet ${walletAddress} not found `);
      }

      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );

      const targetLock = userLocks.find(
        (lock) => lock.id.toString() === lockId,
      );

      if (!targetLock) {
        this.logger.error(
          `[TRANSFER Lock: ${lockId}]: Lock with id${lockId} not found`,
        );

        throw new Error(`Lock with id ${lockId} not found`);
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        this.logger.error(`[TRANSFER Lock: ${lockId}]: NO tokens in cache`);
        throw new Error('Tokens info not found');
      }

      const tokenInfo = tokensInfoList?.find(
        (t) => t.symbol.toUpperCase() === token.toUpperCase(),
      );

      if (!tokenInfo) {
        this.logger.error(`[Merge Locks: ${logId}]: Token ${token} not founds`);

        throw new Error(`Token ${token} not found`);
      }

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice; //TODO:
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
      const gasFormatted = formatEther(gasBn);

      const warningMessages: string[] = [];

      const amount = Number(targetLock.amount);

      const { feeBn, fee } = this.aerodromeService.calculateFee(
        +formatUnits(BigInt(amount), +tokenInfo.decimals || 0),
        Number(tokenInfo.price || '0'),
        ethPrice,
        yamlConfig.FEE_DETAILS.FEE_PCT,
        viemClient.chain.nativeCurrency.decimals,
      );

      if (fee <= 0) {
        this.logger.error(`
               [TRANSFER Lock Tokens: ${logId}]: fee calc crush  => fee :${fee} ,feeBn: ${feeBn} 
          `);

        throw new Error(
          'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
        );
      }

      if (isSimulation) {
        return {
          success: true,
          isSimulation,
          lockId,
          gasBn,
          gasFormatted,
          gasUSD: Number(gasUSD).toFixed(2),
          warningMessages,
          chainId,
        };
      }

      const lockData: ITransferLock = {
        walletAddress,
        toAddress,
        lockId,
        feeBn,
      };
      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyTransferLock(chainId, lockData);
      }

      return {
        success: true,
        action: 'transferLock',
        isSimulation,
        ...lockData,
        chainId,
      };
    } catch (err) {
      this.logger.error(
        `[TRANSFER Lock: ${lockId}]: ${err.message}`,
        err.stack,
      );

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
  }

  async setLockToRelay(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    relayId: string,
    isSimulation: boolean,
  ) {
    const setLockId = `${user.id}_${crypto.randomUUID()}`;

    this.logger.log(
      `[Setting Lock: ${setLockId}]: Starting seting lock to relay process`,
    );

    if (!lockId || !relayId) {
      this.logger.error(
        `[Setting Lock: ${setLockId}]: Lock ID or Relay ID not found in arguments`,
      );
      return {
        success: false,
        message: 'Invalid arguments was provided.',
      };
    }

    const lockIdBN = BigInt(lockId);
    const relayIdBN = BigInt(relayId);

    const walletAddress = user.wallets.find(
      (wallet) => wallet.isDefault,
    )?.address;

    if (!walletAddress) {
      this.logger.error(
        `[Setting Lock: ${setLockId}]: User wallet ${walletAddress} not found`,
      );
      return {
        success: false,
        message: `User wallet not found.`,
      };
    }

    try {
      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress as Address,
      );
      const lock = userLocks.find((lock) => lock.id.toString() === lockId);

      if (!lock) {
        this.logger.error(
          `[Setting Lock: ${setLockId}]: Lock ID ${lockId} not found`,
        );
        return {
          success: false,
          message: `Lock ID not found.`,
        };
      }

      if (lock.votes?.length) {
        this.logger.error(
          `[Setting Lock: ${setLockId}]: Lock ID ${lockId} already had votes`,
        );
        return {
          success: false,
          message: `Lock ID ${lockId} has already had votes. Wait for the voting round finishing or create new lock.`,
        };
      }

      const relays = await this.aerodromeStatsService.getTopRelaysData(
        chainId,
        walletAddress as Address,
      );

      if (
        !relays ||
        !relays?.some((relay) => relay.venft_id.toString() === relayId)
      ) {
        this.logger.error(
          `[Setting Lock: ${setLockId}]: Relay ID ${relayId} not found`,
        );
        return {
          success: false,
          message: `Relay ID not found.`,
        };
      }

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privySetLockToRelay(
          chainId,
          walletAddress as Address,
          lockIdBN,
          relayIdBN,
        );
      }

      return {
        success: true,
        isSimulation,
        tokenId: lockIdBN,
        mTokenId: relayIdBN,
        chainId,
      };
    } catch (error) {
      this.logger.error(
        `[Setting Lock: ${setLockId}]: Error occurred during setting lock to relay: ${error.message}.`,
      );

      return {
        success: false,
        message: error?.message || 'Something went wrong',
      };
    }
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
    const idForLogs = `${user.id}_${crypto.randomUUID()}`;
    const { lockList, isSimulation, token, chainId } = args;

    this.logger.log(
      `[REBASE Tokens: ${idForLogs}]:Starting withdraw lock tokens process`,
    );

    const successMessages: {
      success: true;
      isSimulation: boolean;
      [key: string]: any;
    }[] = [];

    const errorMessages: {
      lockId: string;
      success: false;
      isSimulation: boolean;
      message: string;
    }[] = [];
    const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
      ?.address as Address;

    if (!walletAddress) {
      this.logger.error(
        `[REBASE Lock Tokens: ${idForLogs}]: Invalid wallet {${walletAddress}}`,
      );

      throw new Error(`User wallet ${walletAddress} not found `);
    }
    const lockData: IClaimLock = {
      walletAddress,
      feeBn: BigInt(0),
      lockIds: [],
    };

    for (const lockId of lockList) {
      try {
        if (
          !isBoolean(isSimulation) ||
          !isString(token) ||
          !isNumber(chainId) ||
          !isString(lockId) ||
          token.toUpperCase() !== 'AERO'
        ) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: Invalid arguments`,
          );

          throw new Error(
            'AI error occurred. Sometimes it happens. Please try again.',
          );
        }

        const viemClient = this.viemService.getViemClient(chainId);

        const userLocks = await this.aerodromeService.getLocksByAddress(
          chainId,
          walletAddress,
        );

        const targetLock = userLocks.find(
          (lock) => lock.id.toString() === lockId,
        );

        if (!targetLock) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: Lock with id${lockId} not found `,
          );

          throw new Error(`Lock with id ${lockId} not found`);
        }

        if (Number(targetLock.managed_id) !== 0) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: Lock with id${lockId} relay lock id ${targetLock.managed_id} `,
          );

          throw new Error(
            `Lock with id ${lockId} managed by Relay id ${targetLock.managed_id}. Withdraw lock from relay first`,
          );
        }

        if (Number(targetLock.rebase_amount) <= 0) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: Lock #${lockId} has no rewards`,
          );

          throw new Error(`Lock #${lockId} has no rewards`);
        }

        const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
          getTokenInfoKey(chainId),
        );

        if (!tokensInfoList) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: NO tokens in cache`,
          );
          throw new Error('Tokens info not found');
        }

        const tokenInfo = tokensInfoList?.find(
          (t) => t.symbol.toUpperCase() === token.toUpperCase(),
        );

        if (!tokenInfo) {
          this.logger.error(
            `[REBASE Lock Tokens: ${idForLogs}]: Token ${token} not found`,
          );

          throw new Error(`Token ${token} not found`);
        }

        const amountBn = targetLock.rebase_amount;
        const amount = formatUnits(amountBn, tokenInfo.decimals);
        const amountUsd = Number(amount) * Number(tokenInfo.price || 0);

        const ethToken = tokensInfoList.find(
          (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
        );

        const ethPrice = +(ethToken?.price || 0);

        const gasPrice = await viemClient.getGasPrice();
        const gasBn = BigInt(300000) * gasPrice;
        const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

        const gasUSD = formatNumber(gasUsdWithoutFormatting, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        });
        const gasFormatted = formatEther(gasBn);
        const { feeBn, fee } = this.aerodromeService.calculateFee(
          +amount,
          Number(tokenInfo.price || '0'),
          ethPrice,
          yamlConfig.FEE_DETAILS.FEE_PCT,
          viemClient.chain.nativeCurrency.decimals,
        );

        if (fee <= 0) {
          this.logger.error(`
               [REBASE Tokens: ${idForLogs}]: fee calc crush  => fee :${fee} ,feeBn: ${feeBn} 
          `);

          throw new Error(
            'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
          );
        }

        if (isSimulation) {
          successMessages.push({
            isSimulation,
            chainId,
            lockId,
            gasBn,
            amount,
            decimals: tokenInfo.decimals,
            token,
            gasFormatted,
            amountUsd,
            gasUSD: Number(gasUSD).toFixed(2),
            success: true,
          });
          continue;
        }

        lockData.lockIds.push(lockId);
        lockData.feeBn += feeBn;
      } catch (err) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: ${err.message}`,
          err.stack,
        );

        errorMessages.push({
          success: false,
          isSimulation,
          lockId,
          message: err.message,
        });
      }
    }

    const shouldExecuteWithoutConfirmation =
      user.should_execute_actions_without_confirmation;

    if (
      (isExternalChat && !isSimulation) ||
      (isExternalChat && shouldExecuteWithoutConfirmation)
    ) {
      const transactionResult = await this.privyClaimLockRewards(
        lockData,
        chainId,
      );

      successMessages.push({
        ...transactionResult,
        ...lockData,
        chainId,
      });
    } else if (!isSimulation) {
      successMessages.push({
        success: true,
        action: 'claimLockRewards',
        isSimulation,
        chainId,
        ...lockData,
      });
    }

    return [...successMessages, ...errorMessages];
  }

  async withdrawLock(
    user: UserEntity,
    isExternalChat: boolean,
    args: {
      lockId: string;
      isSimulation: boolean;
      token: 'AERO' | 'VELO';
      chainId: number;
    },
  ) {
    const idForLogs = `${user.id}_${crypto.randomUUID()}`;
    const { lockId, isSimulation, token, chainId } = args;

    this.logger.log(
      `[Withdraw Tokens: ${idForLogs}]:Starting withdraw lock tokens process`,
    );

    try {
      if (
        !isBoolean(isSimulation) ||
        !isString(token) ||
        !isNumber(chainId) ||
        !isString(lockId) ||
        token.toUpperCase() !== 'AERO'
      ) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: Invalid arguments`,
        );

        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      const viemClient = this.viemService.getViemClient(chainId);

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: Invalid wallet {${walletAddress}}`,
        );

        throw new Error(`User wallet ${walletAddress} not found `);
      }

      const userLocks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );

      const targetLock = userLocks.find(
        (lock) => lock.id.toString() === lockId,
      );

      if (!targetLock) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: Lock with id${lockId} not found `,
        );

        throw new Error(`Lock with id ${lockId} not found`);
      }

      if (!this.isLockExpired(Number(targetLock.expires_at))) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: Lock #${lockId} is not expired`,
        );

        throw new Error(`
          Lock #${lockId} is not expired
          `);
      }

      const tokensInfoList = await this.cacheService.get<TokenResponse[]>(
        getTokenInfoKey(chainId),
      );

      if (!tokensInfoList) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: NO tokens in cache`,
        );
        throw new Error('Tokens info not found');
      }

      const tokenInfo = tokensInfoList?.find(
        (t) => t.symbol.toUpperCase() === token.toUpperCase(),
      );

      if (!tokenInfo) {
        this.logger.error(
          `[Withdraw Lock Tokens: ${idForLogs}]: Token ${token} not found`,
        );

        throw new Error(`Token ${token} not found`);
      }

      const amountBn = targetLock.amount;
      const amount = formatUnits(amountBn, tokenInfo.decimals);
      const amountUsd = Number(amount) * Number(tokenInfo.price || 0);

      const ethToken = tokensInfoList.find(
        (token) => token.symbol.toLowerCase() === 'WETH'.toLowerCase(),
      );

      const ethPrice = +(ethToken?.price || 0);

      const gasPrice = await viemClient.getGasPrice();
      const gasBn = BigInt(300000) * gasPrice;
      const gasUsdWithoutFormatting = ethPrice * Number(formatEther(gasBn));

      const gasUSD = formatNumber(gasUsdWithoutFormatting, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
      const gasFormatted = formatEther(gasBn);

      if (isSimulation) {
        return {
          isSimulation,
          lockId,
          gasBn,
          amount,
          gasFormatted,
          amountUsd,
          gasUSD: Number(gasUSD).toFixed(2),
          success: true,
          chainId,
        };
      }

      const { feeBn, fee } = this.aerodromeService.calculateFee(
        +amount,
        Number(tokenInfo.price || '0'),
        ethPrice,
        yamlConfig.FEE_DETAILS.FEE_PCT,
        viemClient.chain.nativeCurrency.decimals,
      );

      if (fee <= 0) {
        this.logger.error(`
               [Withdraw Tokens: ${idForLogs}]: fee calc crush  => fee :${fee} ,feeBn: ${feeBn} 
          `);

        throw new Error(
          'Sorry, something went wrong, please check the arguments you sent and try to start from the beginning later or contact support.',
        );
      }

      const lockData: IWithdrawLock = {
        walletAddress,
        feeBn,
        lockId,
      };

      const shouldExecuteWithoutConfirmation =
        user.should_execute_actions_without_confirmation;

      if (
        (isExternalChat && !isSimulation) ||
        (isExternalChat && shouldExecuteWithoutConfirmation)
      ) {
        return await this.privyWithdrawLock(chainId, lockData);
      }

      return {
        success: true,
        action: 'withdrawLock',
        isSimulation,
        tokenInfo,
        ...lockData,
        chainId,
      };
    } catch (err) {
      this.logger.error(
        `[Withdraw Lock Tokens: ${idForLogs}]: ${err.message}`,
        err.stack,
      );

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
  }

  async pokeLock(
    user: UserEntity,
    isExternalChat: boolean,
    chainId: number,
    lockId: string,
    isSimulation: boolean,
  ) {
    const pokeId = `${user.id}_${crypto.randomUUID()}`;

    this.logger.log(`[Poke Tokens: ${pokeId}]: Starting poke tokens process`);

    try {
      if (!isBoolean(isSimulation) || !isString(lockId)) {
        throw new Error(
          'AI error occurred. Sometimes it happens. Please try again.',
        );
      }

      const walletAddress = user.wallets.find((wallet) => wallet.isDefault)
        ?.address as Address;

      if (!walletAddress) {
        throw new Error('User wallet not found');
      }

      const locks = await this.aerodromeService.getLocksByAddress(
        chainId,
        walletAddress,
      );
      const lock = locks.find((lock) => lock.id === BigInt(lockId));

      if (!lock) {
        this.logger.error(
          `[Poke Tokens: ${pokeId}]: Lock ID ${lockId} not found for wallet ${walletAddress}`,
        );
        throw new Error(`Lock ID ${lockId} not found.`);
      }

      if (isSimulation) {
        return {
          isSimulation,
          success: true,
          chainId,
          lockId: lockId,
        };
      }

      return {
        success: true,
        action: 'pokeLock',
        isSimulation,
        lockId: lockId,
        chainId,
        walletAddress,
      };
    } catch (err) {
      this.logger.error(`[Poke Tokens: ${pokeId}]: ${err.message}`, err.stack);

      return {
        success: false,
        isSimulation,
        message: err.message,
      };
    }
  }

  private async privyClaimLockRewards(lockData: IClaimLock, chainId: number) {
    const { walletAddress: address, lockIds, feeBn } = lockData;

    const isMany = lockIds.length > 1;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    if (lockIds.length === 0) {
      throw new Error('No lock IDs provided');
    }

    for (const id of lockIds) {
      await this.approveNft(
        chainId,
        votingEscrow,
        id,
        address,
        yamlConfig.SWAPPER_CONTRACTS[chainId],
      );
    }

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: isMany ? 'claimManyRebases' : 'claimRebases',
      args: isMany ? [lockIds.map(BigInt), feeBn] : [BigInt(lockIds[0]), feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId } as const;
  }

  private async privyWithdrawLock(chainId: number, lockData: IWithdrawLock) {
    const { walletAddress: address, feeBn, lockId } = lockData;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    await this.approveNft(
      chainId,
      votingEscrow,
      lockId,
      address,
      yamlConfig.SWAPPER_CONTRACTS[chainId],
    );

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'withdraw',
      args: [BigInt(lockId), feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privyLockTokens(chainId: number, data: ICreateLock) {
    const {
      walletAddress: address,
      amountBn,
      amountToApproveBn,
      feeBn,
      duration,
      token_address,
    } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    await this.approveTokenERC20(
      chainId,
      address,
      token_address,
      amountToApproveBn,
      yamlConfig.SWAPPER_CONTRACTS[chainId],
    );

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'createLockFor',
      args: [amountBn, duration, address, feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privyExtendLock(chainId: number, data: IExtendLock) {
    const { walletAddress: address, duration, lockId } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: votingEscrow,
      abi: veNftAbi,
      functionName: 'increaseUnlockTime',
      args: [BigInt(lockId), duration],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: undefined,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privyIncreaseLock(chainId: number, data: IIncreaseLock) {
    const {
      walletAddress: address,
      amountBn,
      amountToApproveBn,
      feeBn,
      lockId,
      token_address,
    } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    await this.approveTokenERC20(
      chainId,
      address,
      token_address,
      amountToApproveBn,
      yamlConfig.SWAPPER_CONTRACTS[chainId],
    );
    await this.approveNft(
      chainId,
      votingEscrow,
      lockId,
      address,
      yamlConfig.SWAPPER_CONTRACTS[chainId],
    );

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'increaseAmount',
      args: [BigInt(lockId), amountBn, feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privySetLockToRelay(
    chainId: number,
    address: Address,
    lockId: bigint,
    relayId: bigint,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const { voter } = chainsConfig[chainId];

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: voter,
      abi: voterAbi,
      functionName: 'depositManaged',
      args: [lockId, relayId],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: undefined,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privyMergeLocks(chainId: number, data: IMergeLocks) {
    const { lockIds, walletAddress: address, feeBn } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    for (let i = 0; i < lockIds.length; i++) {
      const lockId = lockIds[i];
      await this.approveNft(
        chainId,
        votingEscrow,
        lockId.toString(),
        address,
        yamlConfig.SWAPPER_CONTRACTS[chainId],
      );
    }

    const [from, to] = lockIds;

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'merge',
      args: [from, to, feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async privyTransferLock(chainId: number, data: ITransferLock) {
    const { lockId, walletAddress: address, toAddress, feeBn } = data;

    const viemClient = this.viemService.getViemClient(chainId);

    const { votingEscrow } = chainsConfig[chainId];

    await this.approveNft(
      chainId,
      votingEscrow,
      lockId.toString(),
      address,
      yamlConfig.SWAPPER_CONTRACTS[chainId],
    );

    const tx = (await this.privyService.sendTransaction({
      viemClient,
      address: yamlConfig.SWAPPER_CONTRACTS[chainId],
      abi: getSwapperAbiViaChain(chainId),
      functionName: 'transferLock',
      args: [lockId, toAddress, feeBn],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      value: feeBn,
      account: address,
    })) as Address;

    if (!tx) {
      throw new Error('Invalid transaction');
    }

    const receipt = await getTransactionReceipt(viemClient, {
      hash: tx,
    });

    return { ...receipt, success: true, isSimulation: false, chainId };
  }

  private async approveNft(
    chainId: number,
    nfpm: Address,
    tokenId: string,
    walletAddress: Address,
    spender: Address,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    await this.privyService.approve({
      viemClient,
      address: nfpm,
      abi: erc721Abi,
      functionName: 'approve',
      args: [spender, BigInt(tokenId)],
      chain: MAP_CHAIN_ID_CHAIN[chainId],
      account: walletAddress,
    });
  }

  private async approveTokenERC20(
    chainId: number,
    walletAddress: Address,
    token_address: Address,
    amountToApproveBN: bigint,
    spender: Address,
  ) {
    const viemClient = this.viemService.getViemClient(chainId);

    const allowance = await readContract(viemClient, {
      address: token_address as Address,
      functionName: 'allowance',
      args: [walletAddress, spender],
      abi: erc20Abi,
    });

    this.logger.log('Approval', {
      allowance,
      amountToApproveBN,
    });

    if (allowance < amountToApproveBN) {
      await this.privyService.approve({
        viemClient,
        address: token_address,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amountToApproveBN],
        chain: MAP_CHAIN_ID_CHAIN[chainId],
        account: walletAddress,
      });
    }
  }

  private checkLockExpireTime(lock: TLock) {
    const currentTimestampInSeconds = Math.floor(Date.now() / SECOND);

    if (Number(lock.expires_at) < currentTimestampInSeconds) {
      this.logger.error(
        `[ Lock: ${lock.id}]: Can not extend expired lock ${lock.id}`,
      );

      throw new Error(`Can not proccess expired lock ${lock.id}`);
    }
  }

  private getCurrentEpochTs(epochEnd: Date) {
    return epochEnd.getTime() - new Date().getTime();
  }

  private isLockExpired(exp_at_in_sec: number) {
    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    return currentTimeInSeconds >= exp_at_in_sec;
  }
}
