import { FormattedTransactionDto } from '../dtos/formatted-transaction.dto';
import { getCombinedAbisByChainId } from './get-combined-abis-by-chain-id';
import { getExceptionAddresses } from './get-exception-addresses';
import { getManagersByChainId } from './get-managers-by-chain-id';
import { getChainContracts } from './get-chain-contracts';
import { TransactionType } from '../types/transactions.enum';
import {
  Address,
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  erc721Abi,
  formatEther,
  formatUnits,
  Hash,
  MulticallParameters,
  TransactionReceipt,
} from 'viem';
import { DAY, SECOND } from 'src/common/constants/time';
import { CacheService } from '../../cache/cache.service';
import { ViemService } from '../../viem/viem.service';
import { PoolData } from 'src/common/types';
import { formatTxAmount } from 'src/common/utils/format-tx-amount';
import { intersectionWith } from 'lodash';
import { Injectable, Logger } from '@nestjs/common';
import { ITxToFromat } from '../types';
import { IToken } from 'src/common/types/token';
import { getPoolsDataKey } from '../../cache/constants/keys';
import { decodeSwapResult } from 'src/common/utils/decode-swap-result';

@Injectable()
export class FormatTransactions {
  private readonly logger = new Logger(FormatTransactions.name);

  constructor(
    private readonly viemService: ViemService,
    private readonly cacheService: CacheService,
  ) {}

  async format(
    transactions: ITxToFromat[],
    walletAddress: string,
    listedTokens: IToken[],
    limit: number,
    chainId: number,
  ): Promise<FormattedTransactionDto[]> {
    const combinedAbis = getCombinedAbisByChainId(chainId);

    if (!combinedAbis) {
      throw new Error(`No abis found for chainId: ${chainId}`);
    }

    const exceptionAddresses = getExceptionAddresses(chainId);

    if (!exceptionAddresses) {
      throw new Error(`No exceptionAddresses found for chainId: ${chainId}`);
    }

    const managers = getManagersByChainId(chainId);

    if (!managers) {
      throw new Error(`No managers found for chainId: ${chainId}`);
    }

    const chainContracts = getChainContracts(chainId);

    if (!chainContracts) {
      throw new Error(`No chain Contracts found for chainId: ${chainId}`);
    }

    const viemClient = this.viemService.getViemClient(chainId);

    const pools = await this.cacheService.get<PoolData[]>(
      getPoolsDataKey(chainId),
    );
    const result: FormattedTransactionDto[] = [];

    let amountOfSuccessfulTransactions = 0;

    for (const tx of transactions) {
      if (amountOfSuccessfulTransactions >= limit) {
        break;
      }

      const transaction = await viemClient.getTransaction({
        hash: tx.hash as Hash,
      });

      const receipt = await viemClient.getTransactionReceipt({
        hash: tx.hash as Hash,
      });

      if (
        (!transaction || transaction.value === BigInt(0)) &&
        !exceptionAddresses.includes(tx.to?.toLowerCase() || '')
      ) {
        continue;
      }

      if (
        tx.value === undefined ||
        tx.value === null ||
        (tx.value === 0 &&
          !exceptionAddresses.includes(tx.to?.toLowerCase() || ''))
      ) {
        continue;
      }

      if (receipt.status === 'reverted') {
        continue;
      }

      amountOfSuccessfulTransactions++;

      // Decode the function selector
      let functionName;
      let args;

      // Find the corresponding function name
      for (const abi of combinedAbis) {
        for (const item of abi) {
          if (item.type === 'function') {
            try {
              // Encode function selector for comparison
              const data = decodeFunctionData({
                abi: [item],
                data: transaction.input,
              });
              functionName = data.functionName;
              args = data.args as typeof data.args;
            } catch {}
          }
        }
      }
      const isSend =
        transaction.from.toLowerCase() === walletAddress.toLowerCase();
      const isReceive =
        transaction.to?.toLowerCase() === walletAddress.toLowerCase();

      const allTxByHash = [
        tx,
        ...(await this.decodeTx(
          receipt,
          listedTokens,
          pools,
          walletAddress as Address,
          tx.timestamp,
          this.logger,
          chainId,
        )),
      ];

      const outcomeTransactions = allTxByHash.filter(
        (t) => t.from.toLowerCase() === walletAddress.toLowerCase(),
      );

      const incomeTransactions = allTxByHash.filter(
        (t) => t.to?.toLowerCase() === walletAddress.toLowerCase(),
      );

      const isInteractionWithManagers = managers.includes(
        transaction.to?.toLowerCase() || '',
      );

      let outcomeResult = '';
      let incomeResult = '';
      let amountUsdSent = 0;
      let amountUsdReceived = 0;

      const ethPrice = Number(
        listedTokens.find(
          (token) =>
            token.token_address ===
            '0x4200000000000000000000000000000000000006',
        )?.price || 0,
      );
      // Tokens
      if (transaction.value > 0) {
        const value = formatEther(transaction.value);
        if (
          (isSend && !isInteractionWithManagers) ||
          outcomeTransactions.length <= 1
        ) {
          outcomeResult += `${formatTxAmount(value)} ETH`;
          amountUsdSent += +value * ethPrice;
        }
        if (isReceive && !isInteractionWithManagers) {
          incomeResult += `${formatTxAmount(value)} ETH`;
          amountUsdReceived += +value * ethPrice;
        }
      }
      for (let i = 0; i < outcomeTransactions.length; i++) {
        const outcomeTransaction = outcomeTransactions[i];
        // TODO check why asset can be number value (maybe on stake???)
        if (typeof outcomeTransaction.asset === 'string') {
          if (
            outcomeTransaction.asset?.toUpperCase() !== 'ETH' &&
            !pools?.some(
              (pool) =>
                pool.lp.toLowerCase() ===
                  outcomeTransaction.rawContractAddress?.toLowerCase() || '',
            )
          ) {
            if (
              transaction.value > 0 &&
              ((isSend && !isInteractionWithManagers) ||
                outcomeTransactions.length <= 1)
            ) {
              outcomeResult += ', ';
            }

            if (outcomeTransaction.value !== null) {
              const price = Number(
                listedTokens.find(
                  (token) =>
                    token.symbol.toUpperCase() ===
                    outcomeTransaction.asset?.toUpperCase(),
                )?.price || 0,
              );
              outcomeResult += `${formatTxAmount(outcomeTransaction.value)} ${
                outcomeTransaction.asset
              }`;
              amountUsdSent += +outcomeTransaction.value * price;

              if (i < outcomeTransactions.length - 2) {
                outcomeResult += ', ';
              } else if (i === outcomeTransactions.length - 2) {
                outcomeResult += ' and ';
              }
            }
          }
        }
      }
      for (let i = 0; i < incomeTransactions.length; i++) {
        const incomeTransaction = incomeTransactions[i];
        // TODO check why asset can be number value (maybe on stake???)
        if (typeof incomeTransaction.asset === 'string') {
          if (
            incomeTransaction.asset?.toUpperCase() !== 'ETH' &&
            !pools?.some(
              (pool) =>
                pool.lp.toLowerCase() ===
                  incomeTransaction.rawContractAddress?.toLowerCase() || '',
            )
          ) {
            if (
              transaction.value > 0 &&
              isReceive &&
              !isInteractionWithManagers
            ) {
              incomeResult += ', ';
            }

            if (incomeTransaction.value !== null) {
              const price = Number(
                listedTokens.find(
                  (token) =>
                    token.symbol.toUpperCase() ===
                    incomeTransaction.asset?.toUpperCase(),
                )?.price || 0,
              );
              incomeResult += `${formatTxAmount(incomeTransaction.value)} ${
                incomeTransaction.asset
              }`;
              amountUsdReceived += +incomeTransaction.value * price;

              if (i < incomeTransactions.length - 2) {
                incomeResult += ', ';
              } else if (i === incomeTransactions.length - 2) {
                incomeResult += ' and ';
              }
            }
          }
        }
      }

      let type: TransactionType = TransactionType.Unknown;
      let action;
      let title;

      const timestamp = new Date(tx.timestamp).getTime();

      switch (functionName) {
        case 'transfer':
        case 'transferFrom':
          if (isSend) {
            type = TransactionType.Sent;
            title = `${outcomeResult}`;
          }
          if (isReceive) {
            title = `${incomeResult}`;
            type = TransactionType.Receive;
          }
          break;
        case 'approve':
          title = `Approve ${outcomeResult || incomeResult}`;
          type = TransactionType.Sent;
          break;
      }

      if (isInteractionWithManagers) {
        const pool = intersectionWith(
          pools,
          allTxByHash,
          (a, b) =>
            a.lp.toLowerCase() === b.rawContractAddress?.toLowerCase() ||
            a.lp.toLowerCase() === b.from?.toLowerCase() ||
            a.lp.toLowerCase() === b.to?.toLowerCase() ||
            a.lp.toLowerCase() === transaction.to?.toLowerCase() ||
            a.lp.toLowerCase() === transaction.from?.toLowerCase() ||
            (a.token0?.toLowerCase() === args?.[0].token0?.toLowerCase() &&
              a.token1?.toLowerCase() === args?.[0].token1?.toLowerCase() &&
              a.type === args?.[0].tickSpacing),
        );

        switch (functionName) {
          case 'execute':
          case 'swap':
            const result = await decodeSwapResult(
              receipt,
              listedTokens,
              receipt.from,
            );
            type = TransactionType.Swap;
            if (result) {
              title = `Swap ${formatTxAmount(result?.fromAmount || 0)} ${
                result?.fromSymbol
              } for ${formatTxAmount(result?.toAmount || 0)} ${
                result?.toSymbol
              }`;
            } else {
              title = `${outcomeResult}`;
            }
            break;
          case 'addLiquidityETH':
            const value = formatEther(transaction.value);
            amountUsdSent += +value * ethPrice;
            outcomeResult += ` and ${formatTxAmount(value)} ETH`;
          case 'addLiquidity':
          case 'mint':
          case 'increaseLiquidity':
            if (!outcomeResult && outcomeTransactions.length < 1) {
              const value = formatEther(transaction.value);
              amountUsdSent += +value * ethPrice;
              outcomeResult += `${formatTxAmount(value)} ETH`;
            } else if (!!outcomeResult && outcomeTransactions.length === 1) {
              const value = formatEther(transaction.value);
              amountUsdSent += +value * ethPrice;
              outcomeResult += ` and ${formatTxAmount(value)} ETH`;
            }
            type = TransactionType.Sent;
            title = `Deposit ${outcomeResult || incomeResult} to ${
              pool[0]?.symbol || 'AERO-CL-POS'
            }`;
            break;
          case 'removeLiquidityETH':
            const withdrawValue = formatEther(transaction.value);
            amountUsdReceived += +withdrawValue * ethPrice;
            outcomeResult += ` and ${formatTxAmount(withdrawValue)} ETH`;
          case 'removeLiquidity':
          case 'decreaseLiquidity':
            type = TransactionType.Receive;
            title = `Withdraw ${incomeResult} from ${
              pool[0]?.symbol || 'AERO-CL-POS'
            }`;
            break;
          case 'deposit':
          case 'depositAMM':
            type = TransactionType.Sent;
            title = `Stake ${outcomeResult} in ${
              pool[0]?.symbol || 'AERO-CL-POS'
            }`;
            break;
          case 'withdraw': {
            type = TransactionType.Unlock;
            action = 'Lock';
            const [id] = args;

            title = `Withdraw Lock id #  ${id}`;

            break;
          }
          case 'claimFees':
          case 'collect':
          case 'getRewards':
          case 'getReward':
            type = TransactionType.Receive;
            title = `Claim ${incomeResult} from ${
              pool[0]?.symbol || 'AERO-CL-POS'
            }`;
            break;
          case 'vote':
            const poolsSymbols = args[1]
              .map(
                (addr) =>
                  pools?.find(
                    (pool) => pool.lp.toLowerCase() === addr.toLowerCase(),
                  )?.symbol,
              )
              .filter(Boolean);
            type = TransactionType.Vote;
            title = 'Vote for ';
            if (poolsSymbols.length === 1) {
              title += `${poolsSymbols[0]}.`;
            } else if (poolsSymbols.length > 1) {
              const lastSymbol = poolsSymbols.pop();
              title += `${poolsSymbols.join(', ')} and ${lastSymbol}.`;
            }
            break;
          case 'createLock':
          case 'createLockFor': {
            type = TransactionType.Lock;
            action = 'Create Lock';

            const [amountBn, duration] = args;
            const formattedAmount = formatUnits(amountBn, 18);
            const formattedDuration = Math.floor(
              (Number(duration) * SECOND) / DAY,
            );
            title = `Create lock for ${formattedAmount} AERO, for ${formattedDuration} days`;

            break;
          }
          case 'increaseUnlockTime': {
            type = TransactionType.Lock;
            action = 'Extend Lock';
            const [id, duration] = args;

            const formattedDuration = Math.floor(
              (Number(duration) * SECOND) / DAY,
            );

            title = `Extend Lock id #${id} for ${formattedDuration}`;
            break;
          }
          case 'increaseAmount': {
            type = TransactionType.Lock;
            action = 'Increase';
            const [lockId, amountBn] = args;
            const formattedAmount = formatUnits(amountBn, 18);

            title = `Increase Lock id #${lockId} by ${formattedAmount} AERO`;
            break;
          }
          case 'transferLock': {
            type = TransactionType.Lock;
            action = 'Transfer';
            const [lockId, toAddress] = args;

            title = `Transfer Lock id #${lockId} to ${toAddress}`;
            break;
          }
          case 'poke': {
            type = TransactionType.Lock;
            action = 'Poke';
            const [lockId] = args;

            title = `Poke Lock id #${lockId}`;
            break;
          }
          case 'reset': {
            type = TransactionType.Lock;
            action = 'Reset';
            const [lockId] = args;

            title = `Reset Lock id #${lockId}`;
            break;
          }
          case 'merge':
          case 'mergeLock': {
            type = TransactionType.Lock;
            action = 'Merge Locks';
            const [from, to] = args;
            title = `Merge  from Lock id #${from} to Lock id #${to}`;
            break;
          }
          case 'depositManaged': {
            type = TransactionType.Lock;
            action = 'Deposit Lock To Relay';
            const [lockId, relayId] = args;

            title = `Set Lock id #${lockId} to Relay id #${relayId}`;

            break;
          }
          case 'poke': {
            type = TransactionType.Lock;
            action = 'Poke';

            const [id] = args;
            title = `Poke Lock id #${id}`;
            break;
          }
          case 'reset': {
            type = TransactionType.Lock;
            action = 'Reset Lock';
            const [id] = args;

            title = `Reset Lock id #${id}`;
            break;
          }
        }

        if (!title && isSend) {
          title = `${outcomeResult || incomeResult}`;
          type =
            outcomeResult.length > 0
              ? TransactionType.Sent
              : TransactionType.Receive;
        }

        if (!title && isReceive) {
          title = `${incomeResult || outcomeResult}`;
          type =
            incomeResult.length > 0
              ? TransactionType.Receive
              : TransactionType.Sent;
        }

        result.push({
          title,
          txHash: tx.hash,
          type,
          symbol: tx.asset || '',
          amount: tx.value,
          amountUsd:
            type === TransactionType.Sent ? amountUsdSent : amountUsdReceived,
          timestamp,
          actionTitle: action,
          chainId,
        });
      } else {
        if (isReceive || incomeTransactions.length >= 1) {
          result.push({
            title: `${incomeResult || outcomeResult}`,
            txHash: tx.hash,
            type:
              incomeResult.length > 0
                ? TransactionType.Receive
                : TransactionType.Sent,
            symbol: tx.asset || '',
            amount: tx.value,
            amountUsd:
              incomeResult.length > 0 ? amountUsdReceived : amountUsdSent,
            timestamp,
            chainId,
          });
        }

        if (isSend || outcomeTransactions.length >= 1) {
          result.push({
            title: `${outcomeResult || incomeResult}`,
            txHash: tx.hash,
            type:
              outcomeResult.length > 0
                ? TransactionType.Sent
                : TransactionType.Receive,
            symbol: tx.asset || '',
            amount: tx.value,
            amountUsd:
              outcomeResult.length > 0 ? amountUsdSent : amountUsdReceived,
            timestamp,
            chainId,
          });
        }
      }
    }

    return result;
  }

  private async decodeTx(
    receipt: TransactionReceipt,
    tokens: IToken[],
    pools: PoolData[] | undefined,
    walletAddress: Address,
    timestamp: string,
    logger: Logger,
    chainId: number,
  ): Promise<ITxToFromat[]> {
    const transactions: ITxToFromat[] = [];

    for (let i = 0; i < receipt.logs.length; i++) {
      try {
        const log = receipt.logs[i];
        const decoded = decodeEventLog({
          abi: erc721Abi,
          data: log.data,
          topics: log.topics,
        });

        if (
          decoded.eventName === 'Transfer' &&
          (walletAddress.toLowerCase() === decoded.args.to.toLowerCase() ||
            walletAddress.toLowerCase() === decoded.args.from.toLowerCase())
        ) {
          let symbol = tokens.find(
            (token) =>
              token.token_address.toLowerCase() === log.address.toLowerCase(),
          )?.symbol;

          if (!symbol && pools) {
            symbol = pools.find(
              (pool) => pool.lp.toLowerCase() === log.address.toLowerCase(),
            )?.symbol;
          }

          if (!symbol) {
            const multicallQueue: MulticallParameters['contracts'][0][] = [
              {
                address: log.address,
                abi: erc721Abi,
                functionName: 'symbol',
                args: [],
              },
            ];
            const viemClient = this.viemService.getViemClient(chainId);

            const multicallResults = await viemClient.multicall({
              contracts: multicallQueue.map((item) => item),
            });
            symbol = multicallResults[0].result as string;
          }

          if (!symbol) {
            logger.error(
              `Cant find erc721 token: ${log.address}, txHash: ${receipt.transactionHash}`,
            );
          } else {
            transactions.push({
              from: decoded.args.from as string,
              to: decoded.args.to as string,
              value: null,
              asset: symbol,
              hash: receipt.transactionHash,
              rawContractAddress: log.address as string,
              timestamp: timestamp,
            });
          }
        }
      } catch {}

      try {
        const log = receipt.logs[i];
        const decoded = decodeEventLog({
          abi: erc20Abi,
          data: log.data,
          topics: log.topics,
        });

        if (
          decoded.eventName === 'Transfer' &&
          (walletAddress.toLowerCase() === decoded.args.to.toLowerCase() ||
            walletAddress.toLowerCase() === decoded.args.from.toLowerCase())
        ) {
          let decimals;
          let symbol;

          const token = tokens.find(
            (token) =>
              token.token_address.toLowerCase() === log.address.toLowerCase(),
          );

          if (token) {
            decimals = token.decimals;
            symbol = token.symbol;
          } else {
            const pool = pools?.find(
              (pool) => pool.lp.toLowerCase() === log.address.toLowerCase(),
            );

            if (pool) {
              decimals = pool.decimals;
              symbol = pool.symbol;
            }
          }

          if (!decimals || !symbol) {
            const multicallQueue: MulticallParameters['contracts'][0][] = [
              {
                address: log.address,
                abi: erc20Abi,
                functionName: 'symbol',
                args: [],
              },
              {
                address: log.address,
                abi: erc20Abi,
                functionName: 'decimals',
                args: [],
              },
            ];
            const viemClient = this.viemService.getViemClient(chainId);

            const multicallResults = await viemClient.multicall({
              contracts: multicallQueue.map((item) => item),
            });

            decimals = multicallResults[0].result;
            symbol = multicallResults[1].result;
          }

          if (symbol && decimals) {
            transactions.push({
              from: decoded.args.from as string,
              to: decoded.args.to as string,
              value: parseFloat(formatUnits(decoded.args.value, decimals)),
              hash: receipt.transactionHash,
              asset: symbol,
              rawContractAddress: log.address as string,
              timestamp: timestamp,
            });
          } else {
            logger.error(
              `Cant find erc20 token: ${log.address}, txHash: ${receipt.transactionHash}`,
            );
          }
        }
      } catch {}
    }

    return transactions;
  }
}
