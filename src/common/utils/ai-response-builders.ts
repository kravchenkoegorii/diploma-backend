import Decimal from 'decimal.js';
import { formatUnits } from 'viem';
import { EpochData, ILock, IPosition, PoolData, TokenResponse } from '../types';
import { formatNumber, formatNumberForResponse } from './round-number';
import { DexService } from '../../apps/api/modules/dex/dex.service';
import { MAP_CHAIN_ID_CHAIN } from '../../apps/api/modules/viem/constants';
import { isArray } from 'lodash';
import { SECOND } from '../constants/time';
import { BASE_ID } from '../constants/chains/base';
import { chainsConfig } from '../constants/chains';
import { chainsScansHelper } from './chains-scans-helper';
import {
  ActionType,
  LockOperations,
} from 'src/apps/api/modules/openai/tools-description/types';
import { DeFiBalances } from 'src/apps/api/modules/tokens/types';

export const filteredPoolsResponse = (
  pools: PoolData[],
  isExternalChat: boolean,
) => {
  return pools
    .map((pool) => {
      const apr =
        Number(pool.apr) >= 9000 && !isExternalChat
          ? `<span class="pool-apr-badge--risk">${formatNumberForResponse(
              pool.apr,
            )}%</span>`
          : `${formatNumberForResponse(pool.apr)}%`;

      if (isExternalChat) {
        return `**${pool.symbol}**\n- **Type:** ${
          pool.formattedType
        }\n- **TVL:** ${formatNumberForResponse(
          pool.tvl,
        )}$\n- **APR:** ${apr} | **vAPR:** ${formatNumberForResponse(
          pool.vApr || 0,
        )}%\n- **Volume:** ${formatNumberForResponse(
          pool.volume,
        )}$\n- **Daily emission:** ${formatNumberForResponse(
          pool.dailyEmissionUsd,
        )}$\n- **Votes:** ${formatNumberForResponse(pool.votes || 0)} (\~${
          pool?.votesPercent
        }%)\n`;
      } else {
        return `**${pool.symbol}**\n- **Type:** ${
          pool.formattedType
        }\n- **TVL:** ${formatNumberForResponse(
          pool.tvl,
        )}$\n- **APR:** ${apr} | **vAPR:** ${formatNumberForResponse(
          pool.vApr || 0,
        )}%\n- **Volume:** ${formatNumberForResponse(
          pool.volume,
        )}$\n- **Daily emission:** ${formatNumberForResponse(
          pool.dailyEmissionUsd,
        )}$\n- **Votes:** ${formatNumberForResponse(pool.votes || 0)} (\~${
          pool?.votesPercent
        }%)\n- **Network**: ${MAP_CHAIN_ID_CHAIN[pool.chainId || 0]?.name}`;
      }
    })
    .join('\n');
};

export const liquidityPositionsResponse = (
  data: { type: string; positions: any[] },
  isExternalChat: boolean,
) => {
  let result = '';
  const limit = 5;

  if (data?.positions?.length === 0 || !data?.type) {
    return 'You don`t have any liquidity positions.';
  }

  result += `Total positions count is ${data.positions.length}.\n\n`;

  const positions = data.positions.slice(0, limit);
  const type = data.type;

  if (isExternalChat) {
    positions.forEach((pos) => {
      if (type === 'liquidity') {
        result += `${pos.symbol}\n`;

        result += 'Trading Fees:\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} \~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;

        result += `Emissions: ${formatNumberForResponse(pos.emissionsEarned)} ${
          pos.emissionToken
        } (\~${formatNumberForResponse(pos.emissionsEarnedUSD)}$)\n\n`;
      } else if (type === 'staked') {
        result += `${pos.symbol}\n`;

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.staked0?.toString() || 0,
        )}\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.staked1?.toString() || 0,
        )}\n\n`;
      } else if (type === 'unstaked') {
        result += `${pos.symbol}\n`;

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.unstaked0?.toString() || 0,
        )}\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.unstaked1?.toString() || 0,
        )}\n\n`;
      }
    });
  } else {
    positions.forEach((pos) => {
      if (type === 'liquidity') {
        result += `**${pos.symbol}**\n`;

        result += '- **Trading Fees:**\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} (\~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;

        result += `- **Emissions:** ${formatNumberForResponse(
          pos.emissionsEarned,
        )} ${pos.emissionToken} (\~${formatNumberForResponse(
          pos.emissionsEarnedUSD,
        )}$)\n\n`;
      } else if (type === 'staked') {
        result += `**${pos.symbol}**\n`;

        result += `  - **${pos.token0}** - ${formatNumberForResponse(
          pos.staked0?.toString() || 0,
        )}\n`;

        result += `  - **${pos.token1}** - ${formatNumberForResponse(
          pos.staked1?.toString() || 0,
        )}\n\n`;
      } else if (type === 'unstaked') {
        result += `**${pos.symbol}**\n`;

        result += `  - **${pos.token0}** - ${formatNumberForResponse(
          pos.unstaked0?.toString() || 0,
        )}\n`;

        result += `  - **${pos.token1}** - ${formatNumberForResponse(
          pos.unstaked1?.toString() || 0,
        )}\n\n`;
      }
    });
  }

  if (data.positions.length > limit) {
    const diff = data.positions.length - positions.length;
    result += `You can check other liquidity positions (${diff}) on our terminal.`;
  }

  return result;
};

export const trendingTokensResponse = (
  tokens: TokenResponse[],
  isExternalChat: boolean,
): string => {
  if (isExternalChat) {
    tokens = tokens.slice(0, 5);
  }

  const grouped: Record<number, TokenResponse[]> = tokens.reduce(
    (acc, token) => {
      if (!acc[token.chainId!]) acc[token.chainId!] = [];
      acc[token.chainId!].push(token);
      return acc;
    },
    {} as Record<number, TokenResponse[]>,
  );

  const output: string[] = [];

  Object.entries(grouped).forEach(([chainId, tokenGroup]) => {
    const header = isExternalChat
      ? `**${MAP_CHAIN_ID_CHAIN[chainId]?.name || ''}**:`
      : `### **${MAP_CHAIN_ID_CHAIN[chainId]?.name || ''}**:`;

    const body = tokenGroup
      .map((token, index) => {
        const link = token?.scan_url
          ? token.scan_url
          : token?.chainId
          ? chainsScansHelper(token.chainId, token.token_address, true)
          : '#';

        let tokenInfo = '';
        tokenInfo += ` **${index + 1}. ${token.symbol}:**\n`;
        tokenInfo += `  - [${token.token_address}](${link})\n`;

        if (token?.price) {
          tokenInfo += `  - Price: $${formatNumber(token.price)}\n`;
        }
        if (token?.market_cap) {
          tokenInfo += `  - Market Cap: $${formatNumber(token.market_cap)}\n`;
        }
        if (token?.volume_24h) {
          tokenInfo += `  - Volume for 24h: $${formatNumber(
            token.volume_24h,
          )}\n`;
        }
        if (token?.shortDescrFromAi) {
          tokenInfo += `  - ${token.shortDescrFromAi}\n`;
        }
        return tokenInfo;
      })
      .join(isExternalChat ? '\n' : '\n\n');

    output.push(`${header}\n${body}`);
  });
  output.push(isExternalChat ? '\n' : '\n\n');
  return ['**Tokens:**\n', ...output].join(isExternalChat ? '\n' : '\n\n');
};

export const currentVotingRoundResponse = (
  data: EpochData,
  isExternalChat: boolean,
) => {
  let result = '';

  if (isExternalChat) {
    result += `Current Epoch: ${data.epochCount}\n`;
    result += `Total Supply for Voting: ${formatNumberForResponse(
      data.totalSupply,
    )}\n`;
    result += `New Emissions: ${formatNumberForResponse(data.newEmissions)}\n`;
    result += `Total Fees: ${formatNumberForResponse(
      data.totalFeesForPreviousEpoch,
    )}$\n`;
    result += `Total Incentives: ${formatNumberForResponse(
      data.totalIncentivesForPreviousEpoch,
    )}$\n`;
    result += `Total Rewards: ${formatNumberForResponse(
      data.totalRewardsForPreviousEpoch,
    )}$\n`;
    result += `Ends At: ${new Date(data.endsAt).toLocaleDateString(
      'ru-RU',
    )} (in ${data.endInMs})`;
  } else {
    result += 'Here is the information about the current voting round:\n';
    result += `- **Current Epoch:** ${data.epochCount}\n`;
    result += `- **Total Supply for Voting:** ${formatNumberForResponse(
      data.totalSupply,
    )}\n`;
    result += `- **New Emissions:** ${formatNumberForResponse(
      data.newEmissions,
    )}\n`;
    result += `- **Total Fees:** ${formatNumberForResponse(
      data.totalFeesForPreviousEpoch,
    )}$\n`;
    result += `- **Total Incentives:** ${formatNumberForResponse(
      data.totalIncentivesForPreviousEpoch,
    )}$\n`;
    result += `- **Total Rewards:** ${formatNumberForResponse(
      data.totalRewardsForPreviousEpoch,
    )}$\n`;
    result += `- **Ends At:** ${new Date(data.endsAt).toLocaleDateString(
      'ru-RU',
    )} (in ${data.endInMs})`;
  }

  return result;
};

export const swapSimulationResponse = (
  swaps: Awaited<ReturnType<DexService['swap']>>[],
  isExternalChat: boolean,
) => {
  let result = '';
  swaps = swaps.flat();
  const chainId = swaps[0].chainId;
  const length = swaps.length;
  let successfulSwaps = 0;

  let gasSum = new Decimal(0);
  let gasUsdSum = new Decimal(0);
  for (let i = 0; i < length; i++) {
    const swap = swaps[i];

    if (swap.success) {
      successfulSwaps++;
      const chainId = swap.chainId || BASE_ID;
      const chain = chainsConfig[chainId];

      gasSum = gasSum.add(new Decimal(swap.gasFormatted || '0'));
      gasUsdSum = gasUsdSum.add(new Decimal(swap.gasUSD || '0'));

      if (swap.message && isExternalChat) {
        result += `${swap.message}\n\n`;
      } else if (swap.message) {
        result += `${swap.message}\n\n`;
      }

      if (isExternalChat) {
        result += `From: ${formatNumberForResponse(swap.amountInFormatted)} ${
          swap.tokenInSymbol
        } (\~${formatNumberForResponse(swap.amountInUSD)}$)\n`;

        result += `To: ${formatNumberForResponse(swap.amountOutFormatted)} ${
          swap.tokenOutSymbol
        } (\~${formatNumberForResponse(swap.amountOutUSD)}$)\n`;
        result += `Network: ${MAP_CHAIN_ID_CHAIN[chainId]?.name}\n\n`;
      } else {
        result += '**From:**\n';

        result += `- **Amount:** ${formatNumberForResponse(
          swap.amountInFormatted,
        )} [${swap.tokenInSymbol}](${chain.scanBaseUrl}/token/${
          swap.token0
        })\n`;

        result += `- **USD price:** \~${formatNumberForResponse(
          swap.amountInUSD,
        )}$\n\n`;

        result += '**To:**\n';

        result += `- **Min amount:** ${formatNumberForResponse(
          swap.amountOutFormatted,
        )} [${swap.tokenOutSymbol}](${chain.scanBaseUrl}/token/${
          swap.token1
        })\n`;

        result += `- **Min USD price:** \~${formatNumberForResponse(
          swap.amountOutUSD,
        )}$\n\n`;

        result += `**Network**: ${
          MAP_CHAIN_ID_CHAIN[swap.chainId || BASE_ID]?.name ?? 'unknown'
        }\n`;
        result += `**Slippage:** ${swap.slippage}%\n`;
        result += `**Network fee:** ${formatNumberForResponse(
          swap.gasFormatted,
        )} 'ETH' (\~${formatNumberForResponse(swap.gasUSD)}$)\n\n`;
      }
    } else {
      result += `${swap.message}\n\n`;
    }

    if (i < length - 1 && !isExternalChat) {
      result += '--------------------------------\n';
    }
  }

  if (successfulSwaps > 0) {
    if (isExternalChat) {
      result += `Slippage: ${swaps[0].slippage}%\n`;
      result += `Network fee: ${formatNumberForResponse(
        gasSum.toNumber(),
      )} ETH (\~${gasUsdSum.toFixed(
        gasUsdSum.lessThan(new Decimal(0.1)) ? 2 : 1,
      )}$)\n\n`;
    }

    result += `If everything is correct, confirm ${
      successfulSwaps > 1 ? 'transactions' : 'transaction'
    }.`;
  }

  return result;
};

export const addLiquiditySimulationResponse = (
  simulations: Awaited<ReturnType<DexService['addLiquidityToLp']>>[],
  isExternalChat: boolean,
) => {
  let result = '';

  for (let i = 0; i < simulations.length; i++) {
    const simulation = simulations[i];

    if (simulation.success) {
      if (simulation.message && isExternalChat) {
        result += `${simulation.message}\n\n`;
      } else if (simulation.message) {
        result += `${simulation.message}\n\n`;
      }

      if (isExternalChat) {
        result += `Your deposit to ${simulation.pool}\n\n`;

        result += `${simulation.token0Symbol}: ${
          simulation.amountIn
        } (\~${formatNumberForResponse(simulation.amountInUsd)}$)\n`;

        result += `${simulation.token1Symbol}: ${
          simulation.amountOut
        } (\~${formatNumberForResponse(simulation.amountOutUsd)}$)\n`;

        result += `Network: ${MAP_CHAIN_ID_CHAIN[simulation.chainId!]?.name}\n`;

        result += `Network fee: ${formatNumberForResponse(
          simulation.fee,
        )} ETH (\~${formatNumberForResponse(simulation.feeUsd)}$)\n\n`;

        result += 'If everything is correct, confirm add liquidity.';
      } else {
        result += `Your deposit to [${simulation.pool}](https://basescan.org/address/${simulation.poolAddress})\n\n`;

        result += `**${simulation.token0Symbol}**: ${
          simulation.amountIn
        } (\~${formatNumberForResponse(simulation.amountInUsd)}$)\n`;

        result += `**${simulation.token1Symbol}**: ${
          simulation.amountOut
        } (\~${formatNumberForResponse(simulation.amountOutUsd)}$)\n`;

        result += `**Network fee**: ${formatNumberForResponse(
          simulation.fee,
        )} ETH (\~${formatNumberForResponse(simulation.feeUsd)}$)\n\n`;

        result += `**Operational notice**: Depositing ${simulation.amountIn} ${
          simulation.token0Symbol
        } (\~${formatNumberForResponse(
          simulation.amountInUsd,
        )}$) requires an equivalent ≈ ${simulation.amountOut} ${
          simulation.token1Symbol
        } (\~${formatNumberForResponse(
          simulation.amountOutUsd,
        )}$) to maintain pool balance – verify parity to avoid an imbalanced position.\n\n`;

        result += 'If everything is correct, confirm add liquidity.';
      }
    } else {
      result += `${simulation.message}\n\n`;
    }
  }

  return result;
};

export const walletEarningsResponse = (
  data: { liquidityRewards?: any; votingRewards?: any },
  isExternalChat: boolean,
) => {
  let liquidityRewards = data?.liquidityRewards;
  let votingRewards = data?.votingRewards;

  if (!liquidityRewards?.length && !votingRewards?.length) {
    return 'You don`t have any rewards.';
  }

  let result = '';

  if (liquidityRewards?.length > 0) {
    if (isExternalChat) {
      liquidityRewards = liquidityRewards.slice(0, 3);
      result += 'Liquidity rewards:\n';
      for (let i = 0; i < liquidityRewards.length; i++) {
        const lr = liquidityRewards[i];
        result += `${i + 1}. ${lr.symbol}\n`;

        result += ` - Emissions earned: ${formatNumberForResponse(
          lr.emissionsEarned,
        )} ${lr.emissionsToken} (\~${formatNumberForResponse(
          lr.emissionsEarnedUSD,
        )}$)\n`;

        result += ` - ${
          lr.token0
        } trading fees earned: ${formatNumberForResponse(
          lr.token0FeesEarned,
        )} (\~${formatNumberForResponse(lr.token0FeesEarnedUSD)}$)\n`;

        result += ` - ${
          lr.token1
        } trading fees earned: ${formatNumberForResponse(
          lr.token1FeesEarned,
        )} (\~${formatNumberForResponse(lr.token1FeesEarnedUSD)}$)\n\n`;
      }
    } else {
      result += '### Liquidity rewards:\n';

      for (let i = 0; i < liquidityRewards.length; i++) {
        const lr = liquidityRewards[i];

        result += `${i + 1}. **${lr.symbol}**\n`;

        result += ` - Emissions earned: ${formatNumberForResponse(
          lr.emissionsEarned,
        )} ${lr.emissionsToken} (\~${formatNumberForResponse(
          lr.emissionsEarnedUSD,
        )}$)\n`;

        result += ` - ${
          lr.token0
        } trading fees earned: ${formatNumberForResponse(
          lr.token0FeesEarned,
        )} (\~${formatNumberForResponse(lr.token0FeesEarnedUSD)}$)\n`;

        result += ` - ${
          lr.token1
        } trading fees earned: ${formatNumberForResponse(
          lr.token1FeesEarned,
        )} (\~${formatNumberForResponse(lr.token1FeesEarnedUSD)}$)\n\n`;
      }
    }
  }

  if (votingRewards?.length > 0) {
    votingRewards = votingRewards.slice(
      0,
      isExternalChat ? 3 : votingRewards.length,
    );

    result += isExternalChat ? 'Voting rewards:\n' : '### Voting rewards:\n';
    const groupedRewards = votingRewards.reduce((acc, reward) => {
      const key = reward.venftId;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(reward);
      return acc;
    }, {} as Record<string, any[]>);

    result += Object.entries(groupedRewards)
      .map(([venftId, rewards]: any, index) => {
        const rewardsList = rewards
          .map(
            (r) =>
              ` - ${r.type} earned: ${formatNumberForResponse(r.amount)} ${
                r.tokenSymbol
              } (\~${formatNumberForResponse(r.amountUSD)}$)`,
          )
          .join('\n');

        return `${index + 1}. ${
          isExternalChat ? `veNFT ID ${venftId}` : `**veNFT ID ${venftId}**`
        }\n${rewardsList}`;
      })
      .join('\n\n');
  }
  return result;
};

export const withdrawLiquidityResponse = (
  simulations: any[],
  isExternalChat: boolean,
) => {
  const data = simulations[0];

  if (!data?.success) {
    return data?.message || 'Error occurred during withdrawal';
  }

  let result = '';

  if (isExternalChat) {
    result += `Your withdraw from ${data.details.poolSymbol}\n\n`;

    const token0Amount = formatNumberForResponse(data.details.expectedToken0);
    const token1Amount = formatNumberForResponse(data.details.expectedToken1);

    result += `${data.token0Symbol}: ${token0Amount}\n`;
    result += `USD price: \~${formatNumberForResponse(data.token0USD)}$\n\n`;
    result += `${data.token1Symbol}: ${token1Amount}\n`;
    result += `USD price: \~${formatNumberForResponse(data.token1USD)}$\n\n`;

    result += `Network: ${MAP_CHAIN_ID_CHAIN[data.chainId].name}\n\n`;

    if (data.gasFormatted && data.gasUSD) {
      result += `Network fee: ${formatNumberForResponse(
        data.gasFormatted,
      )} ETH (\~${formatNumberForResponse(data.gasUSD)}$)\n\n`;
    }
  } else {
    result += `### Withdrawal Details\n\n`;
    result += `**Pool:** ${data.details.poolSymbol}\n\n`;

    // Format token amounts and prices
    const token0Amount = formatNumberForResponse(data.details.expectedToken0);
    const token1Amount = formatNumberForResponse(data.details.expectedToken1);

    result += `**${data.token0Symbol}**\n`;
    result += `- Amount: ${token0Amount}\n`;
    result += `- USD Value: \~${formatNumberForResponse(data.token0USD)}$\n\n`;
    result += `**${data.token1Symbol}**\n`;
    result += `- Amount: ${token1Amount}\n`;
    result += `- USD Value: \~${formatNumberForResponse(data.token1USD)}$\n\n`;

    result += `**Network:** ${MAP_CHAIN_ID_CHAIN[data.chainId].name}\n\n`;

    if (data.gasFormatted && data.gasUSD) {
      result += `**Network Fee:** ${formatNumberForResponse(
        data.gasFormatted,
      )} ETH (\~${formatNumberForResponse(data.gasUSD)}$)\n\n`;
    }
  }

  if (!data.hash) {
    result += `If everything is correct, confirm the transaction.`;
  }

  return result;
};

export const stakeSimulationResponse = (
  simulations: any[],
  isExternalChat: boolean,
) => {
  const transaction = simulations[0];
  let result = '';
  result += `Here are the details for staking in the ${transaction.poolSymbol} pool:\n\n`;
  result += `- **Pool:** ${transaction.poolSymbol}\n`;
  result += `- **Deposit:** # ${transaction.positionId}\n`;
  result += `- **Amount to Stake:**\n`;
  result += `  - ${transaction.token0StakeAmount} ${
    transaction.token0Symbol
  } (\~${formatNumberForResponse(transaction.token0StakeAmountUSD)}$)\n`;
  result += `  - ${transaction.token1StakeAmount} ${
    transaction.token1Symbol
  } (\~${formatNumberForResponse(transaction.token1StakeAmountUSD)}$)\n`;

  result += `- **Network:** ${MAP_CHAIN_ID_CHAIN[transaction.chainId].name}\n`;
  result += `- **Estimated APR:** ${transaction.estimatedApr}%\n\n`;

  if (transaction.gasFormatted && transaction.gasUSD) {
    result += `**Network Fee:** ${formatNumberForResponse(
      transaction.gasFormatted,
    )} ETH (\~${formatNumberForResponse(transaction.gasUSD)}$)\n\n`;
  }

  if (transaction.warningMessages && transaction.warningMessages.length > 0) {
    result += `**Warning:**\n`;
    for (const message of transaction.warningMessages) {
      result += `- ${message}\n`;
    }
    result += `\n`;
  }

  result += `If everything is correct, confirm the transaction?`;

  return result;
};

export const unstakeSimulationResponse = (
  simulations: any[],
  isExternalChat: boolean,
) => {
  const transaction = simulations[0];
  let result = '';

  result += `Here are the details for unstaking in the ${transaction.poolSymbol} pool:\n\n`;
  result += `- **Pool:** ${transaction.poolSymbol}\n`;
  result += `- **Deposit:** # ${transaction.positionId}\n`;
  result += `- **Network:** ${MAP_CHAIN_ID_CHAIN[transaction.chainId].name}\n`;
  result += `- **Amount to Unstake:**\n`;

  result += `  - ${transaction.token0UnstakeAmount} ${
    transaction.token0Symbol
  } (\~${formatNumberForResponse(transaction.token0UnstakeAmountUSD)}$)\n`;

  result += `  - ${transaction.token1UnstakeAmount} ${
    transaction.token1Symbol
  } (\~${formatNumberForResponse(transaction.token1UnstakeAmountUSD)}$)\n`;

  result += `- **Network:** ${MAP_CHAIN_ID_CHAIN[transaction.chainId].name}\n`;

  if (transaction.gasFormatted && transaction.gasUSD) {
    result += `**Network Fee:** ${formatNumberForResponse(
      transaction.gasFormatted,
    )} ETH (\~${formatNumberForResponse(transaction.gasUSD)}$)\n\n`;
  }

  if (transaction.warningMessages && transaction.warningMessages.length > 0) {
    result += `**Warning:**\n`;
    for (const message of transaction.warningMessages) {
      result += `- ${message}\n`;
    }
    result += `\n`;
  }

  result += `If everything is correct, confirm the transaction?`;

  return result;
};

export const claimFeeSimulationResponse = (
  data: any,
  isExternalChat: boolean,
) => {
  const simulation = data[0];
  if (!simulation?.length) {
    return 'Something went wrong';
  }

  let result = '';
  result += `Here are the details for claiming fees:\n\n`;

  for (let i = 0; i < simulation.length; i++) {
    const claimFeeData = simulation[i];

    result += `- **Pool:** ${claimFeeData.poolSymbol}\n`;
    result += `- **Deposit:** # ${claimFeeData.positionId}\n`;
    result += `- **Network:** ${
      MAP_CHAIN_ID_CHAIN[claimFeeData.chainId].name
    }\n`;
    result += `- **Trading fees earned:**\n`;

    result += `  - ${formatNumberForResponse(claimFeeData.token0FeesEarned)} ${
      claimFeeData.token0Symbol
    } (\~${formatNumberForResponse(claimFeeData.token0FeesEarnedUSD)}$)\n`;

    result += `  - ${formatNumberForResponse(claimFeeData.token1FeesEarned)} ${
      claimFeeData.token1Symbol
    } (\~${formatNumberForResponse(claimFeeData.token1FeesEarnedUSD)}$)\n\n`;

    if (claimFeeData.gasFormatted && claimFeeData.gasUSD) {
      result += `- **Network Fee:** ${formatNumberForResponse(
        claimFeeData.gasFormatted,
      )} ETH (\~${formatNumberForResponse(claimFeeData.gasUSD)}$)\n\n`;
    }

    if (
      claimFeeData.warningMessages &&
      Array.isArray(claimFeeData.warningMessages) &&
      claimFeeData.warningMessages.length > 0
    ) {
      result += `**Warning:**\n`;
      for (const message of claimFeeData.warningMessages) {
        result += `- ${message}\n`;
      }
      result += `\n`;
    }
  }
  result += `If everything is correct, confirm the transaction?`;

  return result;
};

export const claimEmissionSimulationResponse = (
  data: any,
  isExternalChat: boolean,
) => {
  const simulation = data[0];
  if (!simulation?.length) {
    return 'Something went wrong';
  }

  let result = '';
  result += `Here are the details for claiming emission rewards:\n\n`;

  for (let i = 0; i < simulation.length; i++) {
    const claimEmissionData = simulation[i];

    result += `- **Pool:** ${claimEmissionData.poolSymbol}\n`;
    result += `- **Deposit:** # ${claimEmissionData.positionId}\n`;
    result += `- **Network:** ${
      MAP_CHAIN_ID_CHAIN[claimEmissionData.chainId].name
    }\n`;
    result += `- **Emissions reward:** \n`;
    result += `${formatNumberForResponse(claimEmissionData.emissionsEarned)} ${
      claimEmissionData.emissionToken
    } (\~${formatNumberForResponse(
      claimEmissionData.emissionsEarnedUSD,
    )}$)\n\n`;

    if (claimEmissionData.gasFormatted && claimEmissionData.gasUSD) {
      result += `- **Network Fee:** ${
        claimEmissionData.gasFormatted
      } ETH (\~${formatNumberForResponse(claimEmissionData.gasUSD)}$)\n\n`;
    }

    if (
      claimEmissionData.warningMessages &&
      Array.isArray(claimEmissionData.warningMessages) &&
      claimEmissionData.warningMessages.length > 0
    ) {
      result += `-**Warning:**\n`;
      for (const message of claimEmissionData.warningMessages) {
        result += `- ${message}\n`;
      }
      result += `\n`;
    }
  }
  result += `If everything is correct, confirm the transaction?`;

  return result;
};

export const pokeLokeSimulationResponse = (
  data: any,
  isExternalChat: boolean,
) => {
  const simulation = data[0];

  if (!simulation.success) {
    return `Something went wrong: ${simulation?.message}`;
  }

  let result = `Poking lock **${simulation.lockId}** ID\n\n`;
  result += `If everything is correct, confirm the transaction?`;

  return result;
};

export const claimLockRewardsSimulationResponse = (
  data: any[],
  isExternalChat: boolean,
) => {
  let result = '';
  if (!data.length) {
    return 'Something went wrong';
  }
  data = data.sort((a, b) => a.success - b.success);

  result += `Here are the details for claiming lock rewards:\n\n`;
  for (const transaction of data) {
    const {
      success,
      message,
      amount,
      gasFormatted,
      gasUSD,
      decimals,
      token,
      amountUsd,
      lockId,
      chainId,
    } = transaction;

    if (success) {
      const formattedAmount = formatUnits(amount, decimals);
      result += `Claim reward from **Lock #${lockId}**\n`;
      result += `- **Reward amount:** ${formatNumberForResponse(
        formattedAmount,
      )}  ${token} (\~${formatNumberForResponse(amountUsd)}$)\n`;
      result += `- **Network:** ${MAP_CHAIN_ID_CHAIN[chainId].name}\n`;

      if (gasFormatted && gasUSD) {
        result += `- **Network Fee:** ${formatNumberForResponse(
          gasFormatted,
        )} ETH (\~${formatNumberForResponse(gasUSD)}$)\n`;
      }

      result += 'If everything looks correct, please confirm to proceed.\n\n';
    } else {
      result += `Fail to claim lock #${lockId}.\n Reason: ${message}`;
    }
  }
  return result;
};

export const claimVotingRewardsSimulationResponse = (
  data: any[],
  isExternalChat: boolean,
) => {
  try {
    let result = '';
    if (!data.length) {
      return 'Something went wrong';
    }
    data = data.sort((a, b) => a.success - b.success);

    result += `Here are the details for claiming voting rewards:\n\n`;
    for (let i = 0; i < data.length; i++) {
      const {
        venftId,
        gasFormatted,
        gasUSD,
        success,
        message,
        poolSymbol,
        revardTokensInfo,
      } = data[i];

      if (success) {
        result += `Claim reward from vote veNFT ID: **#${venftId}**, **pool: ${poolSymbol}**:\n\n`;
        for (const { type, amount, symbol, amountUsd } of revardTokensInfo) {
          result += `- ${type} amount :${amount}  ${symbol} (\~${amountUsd})\n\n`;
        }

        if (gasFormatted && gasUSD) {
          result += `\n- **Network Fee:** ${gasFormatted} ETH (\~${formatNumber(
            gasUSD,
          )}$)\n\n`;
        }

        if (i === data.length - 1) {
          result +=
            'If everything looks correct, please confirm to proceed. \n\n';
        }
      } else {
        result += `Fail to claim vote rewards 
Reason: ${message}`;
      }
    }
    return result;
  } catch (error) {
    console.error(
      `Error while parsing result: ${JSON.stringify(data)}. Error: `,
      error,
    );
  }
};

export const claimAllRewardsSimulationResponse = (
  data: Awaited<ReturnType<DexService['claimAllRewards']>>,
  isExternalChat: boolean,
) => {
  if (!isArray(data)) {
    return data.message || 'Something went wrong';
  }

  const groupedRewards = new Map<
    string | undefined,
    Map<
      string | undefined,
      { fees: string[]; emissions: string[]; gas: string[] }
    >
  >();
  const chain = data[0].chainId;

  for (const item of data) {
    const poolSymbol = item.poolSymbol;
    const positionId = item.positionId;
    const action = item.action;

    if (!groupedRewards.has(poolSymbol)) {
      groupedRewards.set(poolSymbol, new Map());
    }

    const poolGroup = groupedRewards.get(poolSymbol);

    if (!poolGroup?.has(positionId)) {
      poolGroup?.set(positionId, { fees: [], emissions: [], gas: [] });
    }

    const positionData = poolGroup?.get(positionId);

    if (!item.success && action === 'claimFee') {
      positionData?.fees.push(`  - ${item.message}`);
    }

    if (!item.success && action === 'claimEmission') {
      positionData?.emissions.push(item.message);
    }

    if (action === 'claimFee' && 'token0Symbol' in item) {
      positionData?.fees.push(
        `  - ${item.token0Symbol}: ${formatNumberForResponse(
          item.token0FeesEarned,
        )} (\~$${formatNumberForResponse(item.token0FeesEarnedUSD)})`,
        `  - ${item.token1Symbol}: ${formatNumberForResponse(
          item.token1FeesEarned,
        )} (\~$${formatNumberForResponse(item.token1FeesEarnedUSD)})`,
      );
    }

    if (action === 'claimEmission' && 'emissionToken' in item) {
      positionData?.emissions.push(
        `${formatNumberForResponse(item.emissionsEarned)} ${
          item.emissionToken
        } (\~$${formatNumberForResponse(item.emissionsEarnedUSD)})`,
      );
    }

    if ('gasFormatted' in item && item.gasFormatted) {
      positionData?.gas.push(
        ` ${formatNumberForResponse(
          item.gasFormatted,
        )} ETH (\~$${formatNumberForResponse(item.gasUSD)})`,
      );
    }
  }

  let result = `Here's the details for claiming all your rewards for network ${MAP_CHAIN_ID_CHAIN[chain].name}:\n\n`;

  for (const [poolSymbol, positions] of groupedRewards.entries()) {
    result += `**${poolSymbol}** Pool:\n\n`;

    for (const [positionId, { fees, emissions, gas }] of positions.entries()) {
      result += `- **Deposit Id #${positionId}**\n`;

      if (fees.length) {
        result += `  - **Fees Earned**:\n  ${fees.join('\n  ')}\n`;
        if (gas[0]) {
          result += `  - **Network Fee:** ${gas[0]}\n\n`;
        }
      }

      if (emissions.length) {
        result += `  - **Emissions Earned**: ${emissions.join('\n ')}\n`;
        if (gas[1]) {
          result += `  - **Network Fee:** ${gas[1]}\n\n`;
        }
      }
    }

    result += '\n';
  }

  result += `Would you like to proceed with claiming these rewards?`;

  return result;
};

export const voteSimulationResponse = (data: any, isExternalChat: boolean) => {
  if (!data.length) {
    return 'Something went wrong';
  }

  const vote = data[0];

  let result = `Your vote-power from Lock ${vote.tokenId} for network ${
    MAP_CHAIN_ID_CHAIN[vote.chainId].name
  }: ${vote.amount} allocated as follows:\n`;

  for (let i = 0; i < vote.pools.length; i++) {
    result += '\n';
    result += `- Pool ${vote.poolsNames[i]}: ${vote.poolsPowers[i]}%`;
  }

  result += '\n\nIf everything is correct, please confirm to cast your vote.';

  return result;
};

export const setLockToRelaySimulationResponse = (
  data: any,
  isExternalChat: boolean,
) => {
  if (!data.length) {
    return 'Something went wrong';
  }

  const setLock = data[0];

  let result = `Here is the setting lock to the relay details:\n`;
  result += ` - **Lock ID**: ${setLock.tokenId}\n`;
  result += ` - **Relay ID**: ${setLock.mTokenId}\n\n`;
  result += ` - **Network**: ${MAP_CHAIN_ID_CHAIN[setLock.chainId].name}\n\n`;

  result += 'Warning: Your Lock unlock date will be extended to 4 years.\n\n';

  result +=
    'If everything is correct, please confirm to set your lock to the relay.';

  return result;
};

export const locksResponseTemplate = (
  data: {
    locks: ILock[];
    type: LockOperations;
    chainId: number;
    message?: string;
  },
  isExternalChat: boolean,
) => {
  let result = '';
  if (!data) return 'Something went wrong';

  const { locks, chainId, message } = data;

  if (message) {
    return message;
  }

  const limit = 5;
  if (locks?.length === 0) {
    return 'You don`t have any locks.';
  }
  if (isExternalChat) {
    locks.slice(0, limit);
  }

  result += `Total locks count is ${locks?.length} on network ${MAP_CHAIN_ID_CHAIN[chainId].name}.\n\n`;

  for (let i = 0; i < locks.length; i++) {
    const lock = locks[i];
    const expiresAtDate = new Date(Number(lock.expires_at) * 1000);
    const daysLeft = Math.floor(
      (expiresAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const isExpired = expiresAtDate.getTime() < Date.now();

    const tokenAmount = formatUnits(lock.amount, lock.decimals);
    const formattedValue = formatNumberForResponse(tokenAmount);

    result += ` **Lock ID:** ${lock.id}\n`;

    result += isExpired
      ? 'Expired\n'
      : `**Expires at:** ${expiresAtDate.toString()}\n`;

    result += isExpired ? '' : ` **Days left:** ${daysLeft} \n`;

    result += ` **${lock.token_symbol?.toUpperCase()} amount:** ${formattedValue} \n\n`;

    if (lock.rebase_amount > BigInt(0)) {
      const rebaseAmount = formatUnits(lock.rebase_amount, lock.decimals);
      const formattedValue = formatNumberForResponse(rebaseAmount);
      result += `*Rebase amount:* ${formatNumberForResponse(formattedValue)}`;
    }

    if (lock.votes.length > 0) {
      result += '**Votes:**\n ';
      for (const vote of lock.votes) {
        result += `**LP:** [${vote?.pool_symbol}](${chainsScansHelper(
          chainId,
          vote.lp,
          false,
        )})\n\n`;

        result += `**Power:** ${formatNumberForResponse(
          formatUnits(vote.weight, lock.decimals),
        )} ${
          lock.token_symbol.toUpperCase() === 'AERO' ? 'veAERO' : 'veVELO'
        } \n\n`;
      }
    }
    if (lock.managed_id.toString() !== '0') {
      result += 'Relay ID: ' + lock.managed_id + '\n\n';
    }
  }

  if (locks.length > limit) {
    const diff = locks.length - limit;
    result += `You can check other locks (${diff}) on our terminal.`;
  }

  return result;
};

export const getPositionsByAddressResponse = (
  data: { type: ActionType; positions: IPosition[] },
  isExternalChat: boolean,
) => {
  let result = '';
  const limit = 5;

  if (data?.positions.length === 0 || !data?.type) {
    return 'You don`t have any liquidity positions.';
  }

  result += `Total positions count is ${data.positions.length}.\n\n`;

  const positions = data.positions.slice(0, limit);
  const type = data.type;

  if (isExternalChat) {
    positions.forEach((pos) => {
      result += `${pos.symbol}\n`;
      result += `Deposit id : ${pos.id}\n`;

      if (type === ActionType.ClaimAllRewards) {
        result += 'Trading Fees:\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} \~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;

        result += `Emissions: ${formatNumberForResponse(pos.emissionsEarned)} ${
          pos.emissionsTokenSymbol
        } (\~${formatNumberForResponse(pos.emissionsEarnedUSD)}$)\n\n`;
      } else if (type === ActionType.Unstake) {
        result += 'Staked tokens:\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          formatUnits(pos.staked0, pos.token0Decimals || 18),
        )} (\~${formatNumberForResponse(pos.staked0USD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          formatUnits(pos.staked1, pos.token0Decimals || 18),
        )} (\~${formatNumberForResponse(pos.staked1USD)}$)\n\n`;
      } else if (type === ActionType.Stake || type === ActionType.Withdraw) {
        result += 'Unstaked tokens:\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          formatUnits(pos.amount0, pos.token0Decimals || 18),
        )} (\~${formatNumberForResponse(pos.amount0USD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          formatUnits(pos.amount1, pos.token1Decimals || 18),
        )} (\~${formatNumberForResponse(pos.amount1USD)}$)\n\n`;
      } else if (type === ActionType.ClaimFee) {
        result += '- **Trading Fees:**\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} (\~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;
      } else if (type === ActionType.ClaimEmission) {
        result += `- **Emissions:** ${formatNumberForResponse(
          pos.emissionsEarned,
        )} ${pos.emissionsTokenSymbol} (\~${formatNumberForResponse(
          pos.emissionsEarnedUSD,
        )}$)\n\n`;
      }
    });
  } else {
    positions.forEach((pos) => {
      result += `${pos.symbol}\n`;
      result += `Deposit id : ${pos.id}\n`;

      if (type === ActionType.ClaimAllRewards) {
        result += '- **Trading Fees:**\n';

        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} (\~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;

        result += `- **Emissions:** ${formatNumberForResponse(
          pos.emissionsEarned,
        )} ${pos.emissionsTokenSymbol} (\~${formatNumberForResponse(
          pos.emissionsEarnedUSD,
        )}$)\n\n`;
      } else if (type === ActionType.Unstake) {
        result += `  - **${pos.token0}** - ${formatNumberForResponse(
          formatUnits(pos.staked0, pos.token0Decimals || 18),
        )} (\~${formatNumberForResponse(pos.staked0USD)}$)\n\n`;

        result += `  - **${pos.token1}** - ${formatNumberForResponse(
          formatUnits(pos.staked1, pos.token1Decimals || 18),
        )} (\~${formatNumberForResponse(pos.staked1USD)}$)\n\n\n`;
      } else if (type === ActionType.Stake || type === ActionType.Withdraw) {
        result += `  - **${pos.token0}** - ${formatNumberForResponse(
          formatUnits(pos.amount0, pos.token0Decimals || 18),
        )} (\~${formatNumberForResponse(pos.amount0USD)}$)\n`;

        result += `  - **${pos.token1}** - ${formatNumberForResponse(
          formatUnits(pos.amount1, pos.token1Decimals || 18),
        )} (\~${formatNumberForResponse(pos.amount1USD)}$)\n\n\n`;
      } else if (type === ActionType.ClaimFee) {
        result += '- **Trading Fees:**\n';
        result += `  - ${pos.token0}: ${formatNumberForResponse(
          pos.token0FeesEarned,
        )} (\~${formatNumberForResponse(pos.token0FeesEarnedUSD)}$)\n`;

        result += `  - ${pos.token1}: ${formatNumberForResponse(
          pos.token1FeesEarned,
        )} (\~${formatNumberForResponse(pos.token1FeesEarnedUSD)}$)\n`;
      } else if (type === ActionType.ClaimEmission) {
        result += `- **Emissions:** ${formatNumberForResponse(
          pos.emissionsEarned,
        )} ${pos.emissionsTokenSymbol} (\~${formatNumberForResponse(
          pos.emissionsEarnedUSD,
        )}$)\n\n`;
      }
    });
  }

  if (data.positions.length > limit) {
    const diff = data.positions.length - positions.length;
    result += `You can check other liquidity positions (${diff}) on our terminal.`;
  }

  return result;
};

export const mergeLocksSimulationResponse = (data: any) => {
  let result = '';
  if (!data || !data.isSimulation || !data.success) {
    return result;
  }
  const { lock1, lock2, symbol, estimatedDuration, warningMessages } = data;

  const amount0 = formatUnits(lock1.amount, lock1.decimals);
  const amount1 = formatUnits(lock2.amount, lock2.decimals);

  result += `- Merging the following locks \n`;

  result += `* From Lock 1: *${formatNumberForResponse(
    amount0,
  )} ${symbol}, ${new Date(lock1.expires_at * SECOND)} \n`;

  result += `* To Lock 2:* ${formatNumberForResponse(
    amount1,
  )} ${symbol}, ${new Date(lock2.expires_at * SECOND)} \n`;

  result += `The merged lock will have a total of ${formatNumberForResponse(
    lock1.amount + lock2.amount,
  )} ${symbol} \n`;

  result += `$${symbol} and a lock duration of ${estimatedDuration} days. \n`;

  if (warningMessages && warningMessages.length > 0) {
    result += '\n\nWarning:';
  }

  for (const message of warningMessages) {
    result += `\n- ${message}`;
  }

  result += `\n If everything looks correct, please confirm to proceed with the merge. `;
  return result;
};

export const formatWalletBalances = (
  data: { chainId: string; balances: DeFiBalances }[],
  isExternalChat: boolean,
) => {
  const uniqueData = Array.from(
    new Map(data.map((item) => [item.chainId, item])).values(),
  );

  const balances = uniqueData
    ?.filter((chain) => !!chain.balances.length)
    .map(({ chainId, balances }, i) => {
      const chain = MAP_CHAIN_ID_CHAIN[+chainId];
      const chainName = `${chain.name}`;

      const balanceText = balances
        .map(({ asset, balance }) => {
          const usdValue = ((asset?.price ?? 0) * balance).toFixed(2);

          const formattedBalance = balance.toFixed(4);

          return ` - **${asset.symbol}**: ${formattedBalance}  (~＄${usdValue})`;
        })
        .join('\n');

      return `${isExternalChat ? '###' : ''} **${
        i + 1
      }. ${chainName}:** \n${balanceText}`;
    });

  if (!balances.length) {
    return `**You have no balance**${isExternalChat ? '\n' : '\n\n'}`;
  }

  balances.push(isExternalChat ? '\n' : '\n\n');

  return ['**Token Balances:**\n', ...balances].join('\n\n');
};

export const resetLockSimulationResponse = (data: { lockId: string }) => {
  return `
  Resetting lock with ID **${data.lockId}** \n\n
  
  If everything looks correct, please confirm to proceed with the reset.`;
};
