import { Injectable, Logger } from '@nestjs/common';
import { Role } from 'src/common/enums/openai.role.enum';
import {
  SYSTEM_PROMPT_CHAT_TITLE,
  SYSTEM_PROMPT_ERROR,
  SYSTEM_PROMPT_SUCCESSFUL_SWAP_TX,
  SYSTEM_PROMPT_SUCCESSFUL_TX,
} from 'src/common/prompts/openai.prompts';
import { getTransactionReceipt } from 'viem/actions';
import { SenderType } from '../../../../common/enums/sender.type.enum';
import { NotFoundException } from '../../../../common/exceptions';
import { IToken } from '../../../../common/types/token';
import { CacheService } from '../cache/cache.service';
import { getTokenInfoKey } from '../cache/constants/keys';
import { ChatEntity } from '../chats/entities/chat.entity';
import { ChatsRepository } from '../chats/repositories/chats.repository';
import { OpenAiService } from '../openai/openai.service';
import { UserEntity } from '../users/entities/user.entity';
import { UsersRepository } from '../users/repositories/users.repository';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';
import { CreateErrorMessageDto } from './dto/create-error-message.dto';
import {
  CreateTxMessageDto,
  TxMessageDto,
} from './dto/create-swap-tx-message.dto';
import { MessagesRepository } from './repositories/messages.repository';
import { ETxMessageType } from './types';
import { decodeSwapResult } from '../../../../common/utils/decode-swap-result';
import { ViemService } from '../viem/viem.service';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly chatsRepository: ChatsRepository,
    private readonly openAiService: OpenAiService,
    private readonly userRepository: UsersRepository,
    private readonly cacheService: CacheService,
    private readonly viemService: ViemService,
  ) {}

  async addChatMessage(
    dto: CreateChatMessageDto,
    senderType: SenderType,
    user: UserEntity,
    isAgentMsg = false,
  ): Promise<any> {
    const chat = await this.validateChat(dto.chatId, user.id);

    if (
      !isAgentMsg &&
      chat.messages.length <= 1 &&
      chat.title.startsWith('Room')
    ) {
      this.openAiService
        .callOpenAiChat(
          user,
          [
            {
              role: Role.USER,
              content: SYSTEM_PROMPT_CHAT_TITLE(dto.content),
            },
          ],
          undefined,
          false,
          {
            shouldUseTools: true,
          },
        )
        .then((newChatTitle) => {
          this.chatsRepository.update(
            { id: chat.id },
            { title: newChatTitle.resultMessage },
          );
        });
    }

    const messageEntity = this.messagesRepository.create({
      content: dto.content,
      senderType,
      chat,
    });
    const newMessage = await this.messagesRepository.save(messageEntity);

    if (!isAgentMsg) {
      const res = await this.openAiService.sendMessage(
        chat.messages,
        newMessage.content,
        user,
      );

      if (res.usedTools && Array.isArray(res.usedTools)) {
        for (const tool of res.usedTools) {
          await this.messagesRepository.save(
            this.messagesRepository.create({
              tool_calls: tool,
              senderType: SenderType.TOOL,
              chat,
            }),
          );
        }

        delete res.usedTools;
      }

      if (res.resultMessage) {
        return res.resultMessage;
      }

      return res;
    }
  }

  async addTxMessage(dto: CreateTxMessageDto, user: UserEntity) {
    const chat = await this.validateChat(dto.chatId, user.id);

    const realTxs: TxMessageDto[] = [];
    const swapData: {
      fromSymbol: string;
      fromAmount: string;
      toSymbol: string;
      toAmount: string;
    }[] = [];

    for (let i = 0; i < dto.transactions.length; i++) {
      const transaction = dto.transactions[i];
      const viemClient = this.viemService.getViemClient(transaction.chainId);
      const tokens = await this.cacheService.get<IToken[]>(
        getTokenInfoKey(transaction.chainId),
      );

      const hash = transaction.hash;

      try {
        const receipt = await getTransactionReceipt(viemClient, {
          hash,
        });
        const walletAddress = receipt.from;

        if (dto.type === ETxMessageType.SWAP && tokens) {
          const txResult = await decodeSwapResult(
            receipt,
            tokens,
            walletAddress,
          );

          if (txResult?.fromSymbol && txResult?.toSymbol) {
            swapData.push(txResult as (typeof swapData)[0]);
          }
        }

        realTxs.push(transaction);
      } catch (error) {
        this.logger.error(`Error getting tx receipt: ${hash}`);
      }
    }

    let prompt: string;
    if (dto.type === ETxMessageType.SWAP) {
      prompt = SYSTEM_PROMPT_SUCCESSFUL_SWAP_TX(realTxs, swapData);
    } else if (dto.type === ETxMessageType.DEPOSIT) {
      prompt = SYSTEM_PROMPT_SUCCESSFUL_TX(realTxs);
    } else {
      prompt = SYSTEM_PROMPT_SUCCESSFUL_TX(realTxs);
    }

    const messages = this.openAiService.buildMessages(
      chat.messages,
      prompt,
      user,
    );

    const res = await this.openAiService.callOpenAiChat(
      user,
      messages,
      undefined,
      false,
    );

    if (res.usedTools && Array.isArray(res.usedTools)) {
      for (const tool of res.usedTools) {
        await this.messagesRepository.save(
          this.messagesRepository.create({
            tool_calls: tool,
            senderType: SenderType.TOOL,
            chat,
          }),
        );
      }
    }

    if (res.resultMessage) {
      return res.resultMessage;
    }

    return res;
  }

  async addErrorMessage(dto: CreateErrorMessageDto, user: UserEntity) {
    const chat = await this.validateChat(dto.chatId, user.id);

    const messages = this.openAiService.buildMessages(
      chat.messages,
      SYSTEM_PROMPT_ERROR(dto.error),
      user,
    );

    const res = await this.openAiService.callOpenAiChat(
      user,
      messages,
      undefined,
      false,
    );

    if (res.usedTools && Array.isArray(res.usedTools)) {
      for (const tool of res.usedTools) {
        await this.messagesRepository.save(
          this.messagesRepository.create({
            tool_calls: tool,
            senderType: SenderType.TOOL,
            chat,
          }),
        );
      }
    }

    if (res.resultMessage) {
      return res.resultMessage;
    }

    return res;
  }

  private async validateChat(
    chatId: string,
    userId: string,
  ): Promise<ChatEntity> {
    const chat = await this.chatsRepository.findOne({
      where: {
        id: chatId,
        user: {
          id: userId,
        },
      },
      relations: {
        messages: true,
      },
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return chat;
  }
}
