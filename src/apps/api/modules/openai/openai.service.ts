import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import {
  findPoolsWithFiltersPrompt,
  getLiquidityPositionsPrompt,
  getLocksByAddressPrompt,
  getPoolsForVotingPrompt,
  getPositionsByAddressPrompt,
  getTopTokenAdditionalPrompt,
  getWalletEarningsPrompt,
} from 'src/common/prompts/openai.prompts';
import {
  DEFAULT_FREQUENCY_PENALTY,
  DEFAULT_MAX_TOKENS,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PRESENCE_PENALTY,
  DEFAULT_TEMPERATURE,
} from '../../../../common/constants/openai.constants';
import { Role } from '../../../../common/enums/openai.role.enum';
import { SenderType } from '../../../../common/enums/sender.type.enum';
import {
  addLiquiditySimulationResponse,
  claimAllRewardsSimulationResponse,
  claimEmissionSimulationResponse,
  claimFeeSimulationResponse,
  claimLockRewardsSimulationResponse,
  claimVotingRewardsSimulationResponse,
  currentVotingRoundResponse,
  filteredPoolsResponse,
  formatWalletBalances,
  getPositionsByAddressResponse,
  liquidityPositionsResponse,
  locksResponseTemplate,
  mergeLocksSimulationResponse,
  pokeLokeSimulationResponse,
  resetLockSimulationResponse,
  setLockToRelaySimulationResponse,
  stakeSimulationResponse,
  swapSimulationResponse,
  trendingTokensResponse,
  unstakeSimulationResponse,
  voteSimulationResponse,
  walletEarningsResponse,
  withdrawLiquidityResponse,
} from '../../../../common/utils/ai-response-builders';
import { DeFiLlamaService } from '../defillama/defillama.service';
import { MessageEntity } from '../messages/entities/message.entity';
import { UserEntity } from '../users/entities/user.entity';
import { PromptService } from './prompt.service';
import { addLiquidity } from './tools-description/addLiquidity';
import { convertTokenValueFromUSDValue } from './tools-description/convertTokenValueFromUSDValue';
import { calculateTokenValueInUSD } from './tools-description/calculateTokenValueInUSD';
import { claimAllRewards } from './tools-description/claimAllRewards';
import { claimEmission } from './tools-description/claimEmission';
import { claimFee } from './tools-description/claimFee';
import { extendLock } from './tools-description/extendLock';
import { findPoolsWithFilters } from './tools-description/findPoolsWithFilters';
import { getCurrentVotingRound } from './tools-description/getCurrentVotingRound';
import { getHistoricalTokenPrice } from './tools-description/getHistoricalTokenPrice';
import { getHistoricalTokenPriceByCoingeckoName } from './tools-description/getHistoricalTokenPriceByCoingeckoName';
import { getHistoricalTokenPriceBySymbol } from './tools-description/getHistoricalTokenPriceBySymbol';
import { getKnowledge } from './tools-description/getKnowledge';
import { getLiquidityPositions } from './tools-description/getLiquidityPositions';
import { getLocksByAddress } from './tools-description/getLocksByAdress';
import { getPoolsForVoting } from './tools-description/getPoolsForVoting';
import { getPositionsByAddress } from './tools-description/getPositionByAdress';
import { getTokenBySymbol } from './tools-description/getTokenBySymbol';
import { getTokenInfo } from './tools-description/getTokenInfo';
import { getTopRelays } from './tools-description/getTopRelays';
import { getTopTokens } from './tools-description/getTopTokens';
import { getWalletBalanceBySymbol } from './tools-description/getWalletBalanceBySymbol';
import { getWalletBalances } from './tools-description/getWalletBalances';
import { getWalletEarnings } from './tools-description/getWalletEarnings';
import { getWalletPnlSinceYesterday } from './tools-description/getWalletPnlSinceYesterday';
import { increaseLockTokens } from './tools-description/increaseLockTokens';
import { lockTokens } from './tools-description/lockTokens';
import { mergeLocks } from './tools-description/mergeLocks';
import { noTool } from './tools-description/noTool';
import { stake } from './tools-description/stake';
import { swap } from './tools-description/swap';
import { unstake } from './tools-description/unstake';
import { vote } from './tools-description/vote';
import { withdrawAMMPoolLiquidity } from './tools-description/withdrawAMMPoolLiquidity';
import { withdrawCLPoolLiquidity } from './tools-description/withdrawCLPoolLiquidity';
import { IFunctionTool } from './types';
import { setLockToRelay } from './tools-description/setLockToRelay';
import { getSettings } from './tools-description/getSettings';
import { UsersService } from '../users/users.service';
import { updateSettings } from './tools-description/updateSettings';
import { transferLock } from './tools-description/transferLock';
import { DexService } from '../dex/dex.service';
import { TokensService } from '../tokens/tokens.service';
import { withdrawLock } from './tools-description/withdrawLock';
import { claimLockRewards } from './tools-description/claimLockRewards';
import { claimVotingRewards } from './tools-description/claimVotingRewards';
import { getDeFiStatistics } from './tools-description/getDeFiStatistics';
import { ToolNameEnum } from 'src/common/enums/tool.enum';
import { AlloraService } from '../allora/allora.service';
import { fetchPriceInference } from './tools-description/fetchPriceInference';
import { ResponseService } from './response.service';
import { resetLock } from './tools-description/resetLock';
import { pokeLock } from './tools-description/pokeLock';
import { compareValues } from './tools-description/compareValues';
import { getWalletBalanceBySymbolForPair } from './tools-description/getWalletBalanceBySymbolForPair';
import { convertTokenValueFromPercentage } from './tools-description/convertTokenValueFromPercentage';

@Injectable()
export class OpenAiService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAiService.name);

  constructor(
    private readonly promptService: PromptService,
    private readonly tokensService: TokensService,
    private readonly defiLlamaService: DeFiLlamaService,
    private readonly userService: UsersService,
    private readonly dexService: DexService,
    private readonly alloraService: AlloraService,
    private readonly responceService: ResponseService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      organization: process.env.OPENAI_ORGANIZATION_ID || '',
    });
  }

  async sendMessage(
    messageHistory: MessageEntity[],
    userMessage: string,
    user: UserEntity,
    isExternalChat = false,
  ): Promise<any> {
    const messages = this.buildMessages(
      messageHistory,
      userMessage,
      user,
      isExternalChat,
    );

    return await this.callOpenAiChatWithTools(
      user,
      messages,
      undefined,
      isExternalChat,
    );
  }

  async callOpenAiChat(
    user: UserEntity,
    messages: ChatCompletionMessageParam[],
    model = DEFAULT_OPENAI_MODEL,
    isExternalChat,
    options?: {
      shouldUseTools?: boolean;
    },
  ) {
    try {
      if (options?.shouldUseTools) {
        return await this.callOpenAiChatWithTools(
          user,
          messages,
          undefined,
          isExternalChat,
        );
      }

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        max_completion_tokens: DEFAULT_MAX_TOKENS,
        temperature: DEFAULT_TEMPERATURE,
        frequency_penalty: DEFAULT_FREQUENCY_PENALTY,
        presence_penalty: DEFAULT_PRESENCE_PENALTY,
      });

      return response.choices[0].message.content?.trim();
    } catch (error) {
      this.logger.error(`Error with OpenAI API: ${error}`);
      throw new HttpException(
        `OpenAI API Error: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  buildMessages(
    messageHistory: MessageEntity[],
    userMessage: string,
    user: UserEntity,
    isExternalChat = false,
  ): ChatCompletionMessageParam[] {
    const basePrompt = this.promptService.getBasePrompt();

    const messages: ChatCompletionMessageParam[] = [
      { role: Role.SYSTEM, content: basePrompt },
    ];

    messageHistory = messageHistory.slice(messageHistory.length - 64);

    for (const message of messageHistory) {
      if (message.senderType === SenderType.TOOL) {
        if (!message.tool_calls || Array.isArray(message.tool_calls)) {
          continue;
        }

        const toolCall = message.tool_calls;

        messages.push({
          role: Role.ASSISTANT,
          content: null,
          tool_calls: [
            {
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            },
          ],
        });
        messages.push({
          role: Role.TOOL,
          content: toolCall.result,
          tool_call_id: toolCall.id,
        });
      } else if (message.senderType === SenderType.USER && message.content) {
        messages.push({ role: Role.USER, content: message.content });
      } else if (message.content) {
        messages.push({ role: Role.ASSISTANT, content: message.content });
      }
    }
    const defaultWallet = user.wallets?.find((wallet) => wallet.isDefault);

    if (isExternalChat) {
      messages.push({
        role: Role.SYSTEM,
        content:
          `**User:** ${user.email || 'Without name'}\n` +
          `**Current date:** ${new Date().toISOString()}\n` +
          `**Default wallet address:** ${defaultWallet?.address}\n` +
          `**isExternalChat:** ${isExternalChat}` +
          `**shouldExecuteActionsWithoutConfirmation:** ${user.should_execute_actions_without_confirmation}`,
      });
    } else {
      messages.push({
        role: Role.SYSTEM,
        content:
          `**User:** ${user.email}\n` +
          `**Current date:** ${new Date().toISOString()}\n` +
          `**Default wallet address:** ${defaultWallet?.address}` +
          `**isExternalChat:** ${isExternalChat}`,
      });
    }

    messages.push({
      role: Role.USER,
      content: userMessage,
    });

    return messages;
  }

  private buildTools(
    includeExecute = false,
    knowledgeKeys: string[],
  ): Array<IFunctionTool> {
    return [
      getTokenBySymbol(
        includeExecute ? this.tokensService.getTokenBySymbol : undefined,
      ),
      getTokenInfo(
        includeExecute ? this.tokensService.getTokenInfo : undefined,
      ),
      getTopTokens(
        includeExecute ? this.dexService.getTopTokens : undefined,
        trendingTokensResponse,
      ),
      getHistoricalTokenPrice(
        includeExecute
          ? this.defiLlamaService.getHistoricalTokenPrice
          : undefined,
      ),
      getHistoricalTokenPriceBySymbol(
        includeExecute
          ? this.defiLlamaService.getHistoricalTokenPriceBySymbol
          : undefined,
      ),
      getHistoricalTokenPriceByCoingeckoName(
        includeExecute
          ? this.defiLlamaService.getHistoricalTokenPriceByCoingeckoName
          : undefined,
      ),
      getWalletBalances(
        includeExecute ? this.tokensService.getWalletBalances : undefined,
        formatWalletBalances,
      ),
      getWalletBalanceBySymbol(
        includeExecute ? this.tokensService.getBalanceByTokenSymbol : undefined,
      ),
      getWalletBalanceBySymbolForPair(
        includeExecute
          ? this.dexService.getWalletBalanceBySymbolForPair
          : undefined,
      ),
      getWalletPnlSinceYesterday(
        includeExecute
          ? this.defiLlamaService.getWalletPnlSinceYesterday
          : undefined,
      ),
      getLiquidityPositions(
        includeExecute ? this.dexService.getLiquidityPositions : undefined,
        liquidityPositionsResponse,
      ),
      getKnowledge(
        includeExecute ? this.promptService.getKnowledge : undefined,
        undefined,
        knowledgeKeys,
      ),
      getDeFiStatistics(
        includeExecute ? this.dexService.getStatistics : undefined,
      ),
      convertTokenValueFromUSDValue(
        includeExecute
          ? this.dexService.convertTokenValueFromUSDValue
          : undefined,
      ),
      convertTokenValueFromPercentage(
        includeExecute
          ? this.dexService.convertTokenValueFromPercentage
          : undefined,
      ),
      calculateTokenValueInUSD(
        includeExecute
          ? (tokenPriceInUSD: number, amount: number) => {
              return tokenPriceInUSD * amount;
            }
          : undefined,
      ),
      compareValues(
        includeExecute
          ? (firstValue: number, secondValue: number) => {
              const difference = firstValue - secondValue;
              return {
                isFirstGreater: difference > 0,
                difference: Math.abs(difference),
              };
            }
          : undefined,
      ),
      getPoolsForVoting(
        includeExecute ? this.dexService.getPoolsForVoting : undefined,
        filteredPoolsResponse,
      ),
      findPoolsWithFilters(
        includeExecute ? this.dexService.findPoolsWithFilters : undefined,
      ),
      getTopRelays(
        includeExecute ? this.dexService.getTopRelaysData : undefined,
      ),
      getCurrentVotingRound(
        includeExecute ? this.dexService.getCurrentVotingRound : undefined,
        currentVotingRoundResponse,
      ),
      getWalletEarnings(
        includeExecute ? this.dexService.getWalletRewards : undefined,
        walletEarningsResponse,
      ),
      swap(includeExecute ? this.dexService.swapArrayBySymbols : undefined),
      addLiquidity(
        includeExecute ? this.dexService.addLiquidityToLp : undefined,
      ),
      withdrawAMMPoolLiquidity(
        includeExecute ? this.dexService.withdrawAMMPoolLiquidity : undefined,
      ),
      withdrawCLPoolLiquidity(
        includeExecute ? this.dexService.withdrawCLPoolLiquidity : undefined,
      ),
      getPositionsByAddress(
        includeExecute ? this.dexService.getPositionsByAddress : undefined,
        getPositionsByAddressResponse,
      ),
      getLocksByAddress(
        includeExecute ? this.dexService.getExtendedLocksByAddress : undefined,
        locksResponseTemplate,
      ),
      stake(includeExecute ? this.dexService.stakeLp : undefined),
      unstake(includeExecute ? this.dexService.unstakeLp : undefined),
      claimFee(includeExecute ? this.dexService.claimFeeLp : undefined),
      claimEmission(
        includeExecute ? this.dexService.claimEmissionLp : undefined,
      ),
      claimAllRewards(
        includeExecute ? this.dexService.claimAllRewards : undefined,
      ),
      lockTokens(includeExecute ? this.dexService.lockTokens : undefined),
      resetLock(includeExecute ? this.dexService.resetLock : undefined),
      getLocksByAddress(
        includeExecute ? this.dexService.getExtendedLocksByAddress : undefined,
      ),
      vote(includeExecute ? this.dexService.vote : undefined),
      extendLock(includeExecute ? this.dexService.extendLock : undefined),
      increaseLockTokens(
        includeExecute ? this.dexService.increaseLockTokens : undefined,
      ),
      mergeLocks(
        includeExecute ? this.dexService.mergeLocks : undefined,
        mergeLocksSimulationResponse,
      ),
      setLockToRelay(
        includeExecute ? this.dexService.setLockToRelay : undefined,
      ),
      getSettings(this.userService.getUserSettings),
      updateSettings(this.userService.updateUserSettings),
      transferLock(includeExecute ? this.dexService.transferLock : undefined),
      claimLockRewards(
        includeExecute ? this.dexService.claimLockRewards : undefined,
      ),
      claimVotingRewards(
        includeExecute ? this.dexService.claimVotingRewards : undefined,
      ),
      withdrawLock(includeExecute ? this.dexService.withdrawLock : undefined),
      pokeLock(includeExecute ? this.dexService.pokeLock : undefined),
      fetchPriceInference(
        includeExecute ? this.alloraService.fetchPriceInference : undefined,
      ),
      noTool(includeExecute ? () => '' : undefined),
    ];
  }

  private async runFunction(
    name: string,
    args: any,
    user: UserEntity,
    isExternalChat = false,
    knowledgeKeys: string[],
  ) {
    const tools = this.buildTools(true, knowledgeKeys);
    let content = '';
    // calls function based on name

    for (const tool of tools) {
      try {
        if (tool.function.name === name) {
          this.logger.log(
            `Running function ${name} with args: ${JSON.stringify(args)}`,
          );

          if (
            name === 'swap' ||
            name === 'addLiquidity' ||
            name === 'withdrawAMMPoolLiquidity' ||
            name === 'withdrawCLPoolLiquidity' ||
            name === 'stake' ||
            name === 'getPositionsByAddress' ||
            name === 'unstake' ||
            name === 'claimFee' ||
            name === 'claimEmission' ||
            name === 'claimAllRewards' ||
            name === 'vote' ||
            name === 'setLockToRelay' ||
            name === 'pokeLock'
          ) {
            const result = await tool.execute?.(
              user,
              isExternalChat,
              ...Object.values(args),
            );
            content = JSON.stringify(result);
          } else if (
            name === 'lockTokens' ||
            name === 'extendLock' ||
            name === 'increaseLockTokens' ||
            name === 'mergeLocks' ||
            name === 'transferLock' ||
            name === 'withdrawLock' ||
            name === 'claimLockRewards' ||
            name === 'claimVotingRewards' ||
            name === 'resetLock'
          ) {
            const result = await tool.execute?.(user, isExternalChat, args);
            content = JSON.stringify(result);
          } else if (
            name === 'findPoolsWithFilters' ||
            name === 'getTopTokens' ||
            name === 'getWalletBalanceBySymbolForPair'
          ) {
            const result = await tool.execute?.(args);
            content = JSON.stringify(result);
          } else if (name === 'getSettings' || name === 'updateSettings') {
            const result = await tool.execute?.(user, args);
            content = JSON.stringify(result);
          } else {
            const result = await tool.execute?.(...Object.values(args));
            content = JSON.stringify(result);
          }

          this.logger.log(
            `Function [${name}] result:`,
            JSON.stringify(JSON.parse(content), null, 2),
          );

          break;
        }
      } catch (error) {
        this.logger.error(
          `Error running function ${name}: ${JSON.stringify(error.message)}`,
        );
        console.error(error);
        content = JSON.stringify({
          success: false,
          message:
            error.message || 'Something went wrong. Please try again later.',
        });
      }
    }

    return content;
  }

  private async callOpenAiChatWithTools(
    user: UserEntity,
    messages: ChatCompletionMessageParam[],
    maxCalls = 10,
    isExternalChat: boolean,
    usedTools: ChatCompletionMessage['tool_calls'] &
      {
        result: any;
      }[] = [],
  ) {
    const knowledgeKeys = await this.promptService.getKnowledgeKeys();
    const tools = this.buildTools(false, knowledgeKeys);
    let attempts = 0;

    const transactionsData: any[] = [];

    let isAddLiquidityExecution = false;
    let isAddLiquiditySimulation = false;

    let isSwapExecution = false;
    let isSwapSimulation = false;

    let isWithdrawSimulation = false;
    let isWithdrawExecution = false;

    let isStakeSimulation = false;
    let isStakeExecution = false;

    let isUnstakeSimulation = false;
    let isUnstakeExecution = false;

    let isClaimFeeSimulation = false;
    let isClaimFeeExecution = false;

    let isClaimEmissionSimulation = false;
    let isClaimEmissionExecution = false;

    let isClaimAllSimulation = false;
    let isClaimAllExecution = false;

    let isNewLockExecution = false;

    let isVoteSimulation = false;
    let isVoteExecution = false;

    let isResetLockSimulation = false;
    let isResetLockExecution = false;

    let isExtendLockDurationExecution = false;

    let isIncreaseLocksExecution = false;

    let isMergeLocksExecution = false;

    let isTransferLockExecution = false;
    let isWithdrawLockExecution = false;

    let isClaimLockRewardSimulation = false;
    let isClaimLockRewardExecution = false;

    let isClaimVotingRewardSimulation = false;
    let isClaimVotingRewardExecution = false;

    let isSetLockToRelaySimulation = false;
    let isSetLockToRelayExecution = false;

    let isPokeLockSimulation = false;
    let isPokeLockExecution = false;

    const data = new Map<string, any>();

    let hasToolInAnswer = false;
    const messagesBeforeToolCall = messages.length;

    let maxCompilationTokens = DEFAULT_MAX_TOKENS;
    if (maxCalls > 5) {
      maxCompilationTokens = DEFAULT_MAX_TOKENS * 4;
    } else if (maxCalls > 3) {
      maxCompilationTokens = DEFAULT_MAX_TOKENS * 3;
    }

    while (attempts < 3) {
      try {
        const response = await this.openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages,
          max_completion_tokens: maxCompilationTokens,
          temperature: DEFAULT_TEMPERATURE,
          tools: tools,
          tool_choice: 'auto',
          n: 1,
          parallel_tool_calls: true,
        });

        const retrieve_functions = response.choices[0].message;

        const toolCalls = this.filterDuplicateToolCalls(
          retrieve_functions?.tool_calls,
        );
        if (toolCalls) {
          hasToolInAnswer = true;
          messages.push(retrieve_functions);
          for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const parameters = JSON.parse(toolCall.function.arguments);
            const result = await this.runFunction(
              functionName,
              parameters,
              user,
              isExternalChat,
              knowledgeKeys,
            );

            const isExecution =
              parameters.isSimulation === false ||
              (isExternalChat &&
                parameters.isSimulation === true &&
                user.should_execute_actions_without_confirmation);

            if (functionName === 'swap') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isSwapExecution = true;
              } else {
                isSwapSimulation = true;
              }
            }

            if (
              functionName === 'withdrawAMMPoolLiquidity' ||
              functionName === 'withdrawCLPoolLiquidity'
            ) {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isWithdrawExecution = true;
              } else {
                isWithdrawSimulation = true;
              }
            }

            if (functionName === 'addLiquidity') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isAddLiquidityExecution = true;
              } else {
                isAddLiquiditySimulation = true;
              }
            }

            if (functionName === 'stake') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isStakeExecution = true;
              } else {
                isStakeSimulation = true;
              }
            }

            if (functionName === 'unstake') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isUnstakeExecution = true;
              } else {
                isUnstakeSimulation = true;
              }
            }

            if (functionName === 'claimAllRewards') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isClaimAllExecution = true;
              } else {
                isClaimAllSimulation = true;
              }
            }

            if (functionName === 'claimFee') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isClaimFeeExecution = true;
              } else {
                isClaimFeeSimulation = true;
              }
            }

            if (functionName === 'claimLockRewards') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isClaimLockRewardExecution = true;
              } else {
                isClaimLockRewardSimulation = true;
              }
            }

            if (functionName === 'claimVotingRewards') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isClaimVotingRewardExecution = true;
              } else {
                isClaimVotingRewardSimulation = true;
              }
            }

            if (functionName === 'claimEmission') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isClaimEmissionExecution = true;
              } else {
                isClaimEmissionSimulation = true;
              }
            }

            if (functionName === 'resetLock') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isResetLockExecution = true;
              } else {
                isResetLockSimulation = true;
              }
            }

            if (functionName === 'lockTokens') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isNewLockExecution = true;
              }
            }

            if (functionName === 'vote') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isVoteExecution = true;
              } else {
                isVoteSimulation = true;
              }
            }

            if (functionName === 'setLockToRelay') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isSetLockToRelayExecution = true;
              } else {
                isSetLockToRelaySimulation = true;
              }
            }

            if (functionName === 'extendLock') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }

              if (isExecution) {
                isExtendLockDurationExecution = true;
              }
            }

            if (functionName === 'increaseLockTokens') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isIncreaseLocksExecution = true;
              }
            }

            if (functionName === 'mergeLocks') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isMergeLocksExecution = true;
              }
            }

            if (functionName === 'transferLock') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (parameters.isSimulation === false) {
                isTransferLockExecution = true;
              }
            }

            if (functionName === 'withdrawLock') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (parameters.isSimulation === false) {
                isWithdrawLockExecution = true;
              }
            }

            if (functionName === 'pokeLock') {
              try {
                transactionsData.push(JSON.parse(result));
              } catch (error) {
                transactionsData.push(result);
              }
              if (isExecution) {
                isPokeLockExecution = true;
              } else {
                isPokeLockSimulation = true;
              }
            }

            const tool = tools.find(
              (tool) => tool.function.name === functionName,
            );

            if (
              !!tool?.toString ||
              functionName === 'findPoolsWithFilters' ||
              functionName === 'getPoolsForVoting' ||
              functionName === 'getLiquidityPositions' ||
              functionName === 'getTopTokens' ||
              functionName === 'getCurrentVotingRound' ||
              functionName === 'getWalletEarnings' ||
              functionName === 'getLocksByAddress' ||
              functionName === 'mergeLocks' ||
              functionName === 'getWalletBalances'
            ) {
              const existing = data.get(functionName);
              const parsed = this.parseAndPush(result);

              //Handling the cases if the model decided to call getters for each desired chain instead of using an array
              if (Array.isArray(existing) && Array.isArray(parsed)) {
                existing.push(...parsed);
              } else {
                data.set(functionName, parsed);
              }
            }

            messages.push({
              role: Role.TOOL,
              content: result || '',
              tool_call_id: toolCall.id,
            });

            usedTools.push({
              ...toolCall,
              result,
            });
          }
        } else {
          return { resultMessage: retrieve_functions.content, usedTools };
        }

        break;
      } catch (error) {
        attempts++;
        // Remove the messages from the array if it has a tool call
        if (hasToolInAnswer) {
          messages.splice(messagesBeforeToolCall, messages.length);
          hasToolInAnswer = false;
        }
        if (attempts === 3) {
          this.logger.error(
            error,
            'Maximum attempts reached. Unable to generate the function calling JSON.',
          );
          throw new InternalServerErrorException(
            JSON.stringify({
              message: 'Something went wrong. Please try again later.',
            }),
          );
        }
      }
    }

    if (maxCalls <= 0) {
      return this.callOpenAiChat(user, messages, undefined, isExternalChat);
    }

    const successTxs = transactionsData
      .flat()
      .filter((tx) => tx.success && tx.isSimulation);

    if (successTxs.length > 0) {
      if (isSwapSimulation && transactionsData?.length > 0) {
        return {
          usedTools,
          resultMessage: swapSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (isAddLiquiditySimulation && transactionsData?.length > 0) {
        return {
          usedTools,
          resultMessage: addLiquiditySimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (
        isWithdrawSimulation &&
        transactionsData?.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: withdrawLiquidityResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }
      if (
        isResetLockSimulation &&
        transactionsData?.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: resetLockSimulationResponse(transactionsData[0]),
        };
      }

      if (
        isStakeSimulation &&
        transactionsData?.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: stakeSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (
        isUnstakeSimulation &&
        transactionsData?.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: unstakeSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (isClaimAllSimulation && transactionsData.flat()?.length > 0) {
        return {
          usedTools,
          resultMessage: claimAllRewardsSimulationResponse(
            transactionsData.flat(),
            isExternalChat,
          ),
        };
      }

      if (isClaimFeeSimulation && transactionsData?.length > 0) {
        return {
          usedTools,
          resultMessage: claimFeeSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (isClaimEmissionSimulation && transactionsData?.length > 0) {
        return {
          usedTools,
          resultMessage: claimEmissionSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (isPokeLockSimulation && transactionsData?.length > 0) {
        return {
          usedTools,
          resultMessage: pokeLokeSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (isClaimLockRewardSimulation && transactionsData?.length > 0) {
        return claimLockRewardsSimulationResponse(
          transactionsData.flat(),
          isExternalChat,
        );
      }

      if (isClaimVotingRewardSimulation && transactionsData?.length > 0) {
        return claimVotingRewardsSimulationResponse(
          transactionsData.flat(),
          isExternalChat,
        );
      }

      if (
        isVoteSimulation &&
        transactionsData.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: voteSimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }

      if (
        isSetLockToRelaySimulation &&
        transactionsData.length > 0 &&
        transactionsData[0]?.success
      ) {
        return {
          usedTools,
          resultMessage: setLockToRelaySimulationResponse(
            transactionsData,
            isExternalChat,
          ),
        };
      }
    }

    if (isSwapExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.swap>
      >[] = [];
      for (let i = 0; i < transactionsData.length; i++) {
        const transactions = transactionsData[i];

        for (let j = 0; j < transactions.length; j++) {
          const transaction = transactions[j];

          if (transaction.success && !transaction.isSimulation) {
            transactionsResponse.push(transaction);
          }
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.SWAP,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isPokeLockExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.pokeLock>
      >[] = [];

      transactionsData.flatMap((tx) => {
        if (tx.success && !tx.isSimulation) {
          transactionsResponse.push(tx);
        }
      });

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.POKE_LOCK,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isAddLiquidityExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.addLiquidityToLp>
      >[] = [];
      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];
        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.ADD_LIQUIDITY,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isResetLockExecution) {
      if (transactionsData?.[0]) {
        return {
          actionType: ToolNameEnum.RESET_LOCK,
          data: transactionsData[0],
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isWithdrawExecution) {
      const transactionsResponse: Awaited<
        ReturnType<
          | typeof this.dexService.withdrawAMMPoolLiquidity
          | typeof this.dexService.withdrawCLPoolLiquidity
        >
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.WITHDRAW,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isClaimAllExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.claimAllRewards>
      >[] = [];

      const flattedTransactions = transactionsData.flat();

      for (let i = 0; i < flattedTransactions.length; i++) {
        const transaction = flattedTransactions[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.CLAIM_ALL_REWARDS,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isClaimLockRewardExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.claimLockRewards>
      >[] = [];

      const flattedTransactions = transactionsData.flat();

      for (let i = 0; i < flattedTransactions.length; i++) {
        const transaction = flattedTransactions[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.CLAIM_LOCK_REWARDS,
          data: transactionsResponse,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isClaimVotingRewardExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.claimVotingRewards>
      >[] = [];

      const flattedTransactions = transactionsData.flat();

      for (let i = 0; i < flattedTransactions.length; i++) {
        const transaction = flattedTransactions[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: 'claimVotingRewards',
          data: transactionsResponse,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isClaimFeeExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.claimFeeLp>
      >[] = [];

      const flattedTransactions = transactionsData.flat();

      for (let i = 0; i < flattedTransactions.length; i++) {
        const transaction = flattedTransactions[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.CLAIM_FEE,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isClaimEmissionExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.claimEmissionLp>
      >[] = [];

      const flattedTransactions = transactionsData.flat();

      for (let i = 0; i < flattedTransactions.length; i++) {
        const transaction = flattedTransactions[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.CLAIM_EMISSION,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isStakeExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.stakeLp>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.STAKE,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isUnstakeExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.unstakeLp>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.UNSTAKE,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isNewLockExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.lockTokens>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.LOCK_TOKENS,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isVoteExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.vote>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.VOTE,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isSetLockToRelayExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.setLockToRelay>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.SET_LOCK_TO_RELAY,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isExtendLockDurationExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.extendLock>
      >[] = [];
      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.EXTEND_LOCK,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isIncreaseLocksExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.increaseLockTokens>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.INCREASE_LOCK,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    if (isMergeLocksExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.mergeLocks>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.MERGE_LOCKS,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }
    if (isTransferLockExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.transferLock>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.TRANSFER_LOCK,
          data: transactionsResponse,
          usedTools,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }
    if (isWithdrawLockExecution) {
      const transactionsResponse: Awaited<
        ReturnType<typeof this.dexService.withdrawLock>
      >[] = [];

      for (let i = 0; i < transactionsData.length; i++) {
        const transaction = transactionsData[i];

        if (transaction.success && !transaction.isSimulation) {
          transactionsResponse.push(transaction);
        }
      }

      if (transactionsResponse.length > 0) {
        return {
          actionType: ToolNameEnum.WITHDRAW_LOCK,
          data: transactionsResponse,
        };
      } else {
        messages.push({
          role: Role.SYSTEM,
          content: 'No transactions were executed. Throw an error message.',
        });
      }
    }

    let compiledFormattedGettersAnswers = '';

    for (const [key, value] of data) {
      const tool = tools.find((tool) => tool.function.name === key);
      // #region the new approach to format getters

      //NOTE, anly getWalletBalances and getTopTokens for now
      // each getter should have defined filters and etc. with this approach
      if (value && tool?.toString && key === 'getTopTokens') {
        const formattedResponce = tool.toString(value, isExternalChat);
        let toolTextResult = '';
        if (key === 'getTopTokens') {
          const tokens = await this.responceService.addTopTokensShortInfo({
            model: DEFAULT_OPENAI_MODEL,
            data: value,
            previous_response_id: undefined,
          });

          toolTextResult += tool.toString(tokens, isExternalChat);
        } else {
          toolTextResult += tool.toString(value, isExternalChat);
        }

        messages.push({
          role: Role.ASSISTANT,
          content: formattedResponce,
        });

        compiledFormattedGettersAnswers += toolTextResult;
      }
      // #endregion
      if (value && tool?.toString) {
        messages.push({
          role: Role.SYSTEM,
          content:
            `Reference for '${key}' response: ${tool.toString(
              value,
              isExternalChat,
            )}` + `Do not mention this reference in the response.`,
        });

        const additionalPrompt = this.getAdditionalToolPrompt(key);
        if (additionalPrompt) {
          messages.push({
            role: Role.SYSTEM,
            content: additionalPrompt,
          });
        }
      } else if (value && key === 'findPoolsWithFilters') {
        messages.push({
          role: Role.SYSTEM,
          content: findPoolsWithFiltersPrompt,
        });
      }
    }

    if (compiledFormattedGettersAnswers) {
      await this.addMessageToTheContext(messages);
      return {
        usedTools,
        resultMessage:
          compiledFormattedGettersAnswers +
          'If you need further assistance or specific details, feel free to ask!\n',
      };
    }

    maxCalls--;

    return await this.callOpenAiChatWithTools(
      user,
      messages,
      maxCalls,
      isExternalChat,
      usedTools,
    );
  }

  private parseAndPush<T>(result: string): string | T | T[] {
    try {
      const temp = JSON.parse(result);
      if ('pools' in temp) {
        return temp.pools;
      } else if (Array.isArray(temp)) {
        return temp;
      } else {
        return temp;
      }
    } catch {
      return result;
    }
  }

  private getAdditionalToolPrompt(key: string): string | null {
    switch (key) {
      case 'getTopTokens':
        return getTopTokenAdditionalPrompt.trim();
      case 'getLiquidityPositions':
        return getLiquidityPositionsPrompt;
      case 'getWalletEarnings':
        return getWalletEarningsPrompt;
      case 'getLocksByAddress':
        return getLocksByAddressPrompt;
      case 'getPositionsByAddress':
        return getPositionsByAddressPrompt;
      case 'getPoolsForVoting':
        return getPoolsForVotingPrompt;
      default:
        return null;
    }
  }

  private async addMessageToTheContext(messages: ChatCompletionMessageParam[]) {
    await this.openai.chat.completions.create({
      model: DEFAULT_OPENAI_MODEL,
      messages,
      temperature: DEFAULT_TEMPERATURE,
    });
  }

  private filterDuplicateToolCalls(toolCalls: any[] | undefined) {
    //filter to avoid identical calls and if between calls exist non simulate call, we use it
    if (!toolCalls || !toolCalls?.length) return null;
    const uniqueCallsMap = new Map<string, any>();

    for (const call of toolCalls) {
      const func = call.function;
      if (!func?.name || !func?.arguments) continue;

      let parsedArgs: Record<string, any>;
      try {
        parsedArgs = JSON.parse(func.arguments);
      } catch (e) {
        continue;
      }

      const { isSimulation, ...restArgs } = parsedArgs;
      const key = `${func.name}::${JSON.stringify(restArgs)}`;

      const existingCall = uniqueCallsMap.get(key);
      const isCurrentSimulation = Boolean(isSimulation);

      if (!existingCall) {
        uniqueCallsMap.set(key, call);
      } else {
        const existingArgs = JSON.parse(existingCall.function.arguments);
        if (
          existingArgs.isSimulation === true &&
          isCurrentSimulation === false
        ) {
          uniqueCallsMap.set(key, call);
        }
      }
    }

    return Array.from(uniqueCallsMap.values());
  }
}
