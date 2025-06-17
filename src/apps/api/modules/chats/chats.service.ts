import { Injectable } from '@nestjs/common';
import { ChatsRepository } from './repositories/chats.repository';
import { MessagesRepository } from '../messages/repositories/messages.repository';
import { UserEntity } from '../users/entities/user.entity';
import { ChatEntity } from './entities/chat.entity';
import { CreateChatDto } from './dtos/create-chat.dto';
import { UpdateChatDto } from './dtos/update-chat.dto';
import { NotFoundException } from '../../../../common/exceptions';
import { DeleteChatDto } from './dtos/delete-chat.dto';
import { ClearChatDto } from './dtos/clear-chat.dto';
import { SearchChatsDto } from './dtos/search-chats.dto';
import { GetChatWithMessagesDto } from './dtos/get-chat-with-messages.dto';
import { ILike } from 'typeorm';

@Injectable()
export class ChatsService {
  constructor(
    private readonly chatsRepository: ChatsRepository,
    private readonly messagesRepository: MessagesRepository,
  ) {}

  async createChat(dto: CreateChatDto, user: UserEntity): Promise<ChatEntity> {
    const chat = this.chatsRepository.create({
      user,
      title: dto.title,
    });

    return await this.chatsRepository.save(chat);
  }

  async getUserChats(user: UserEntity): Promise<ChatEntity[]> {
    return await this.chatsRepository.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  async getChatWithMessages(dto: GetChatWithMessagesDto): Promise<ChatEntity> {
    const chat = await this.chatsRepository
      .createQueryBuilder('chat')
      .leftJoinAndSelect(
        'chat.messages',
        'message',
        'message.content IS NOT NULL',
      )
      .where('chat.id = :chatId', { chatId: dto.chatId })
      .orderBy('message.createdAt', 'ASC')
      .getOne();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return chat;
  }

  async searchChatsByKeyword(
    dto: SearchChatsDto,
    user: UserEntity,
  ): Promise<ChatEntity[]> {
    return await this.chatsRepository.find({
      where: {
        user: { id: user.id },
        title: ILike(`%${dto.keyword}%`),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async updateChatTitle(dto: UpdateChatDto): Promise<ChatEntity> {
    const chat = await this.validateChat(dto.chatId);

    chat.title = dto.title;
    return await this.chatsRepository.save(chat);
  }

  async deleteChat(dto: DeleteChatDto): Promise<void> {
    const chat = await this.validateChat(dto.chatId);

    await this.chatsRepository.delete(chat.id);
  }

  async deleteAllUserChats(user: UserEntity): Promise<void> {
    const chats = await this.chatsRepository.find({
      where: { user: { id: user.id } },
    });

    const chatIds = chats.map((c) => c.id);
    if (chatIds.length) {
      await this.chatsRepository.delete(chatIds);
    }
  }

  async clearChatMessages(dto: ClearChatDto): Promise<void> {
    const chat = await this.validateChat(dto.chatId);

    await this.messagesRepository.delete({ chat: { id: chat.id } });
  }

  private async validateChat(chatId: string): Promise<ChatEntity> {
    const chat = await this.chatsRepository.findOne({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    return chat;
  }
}
