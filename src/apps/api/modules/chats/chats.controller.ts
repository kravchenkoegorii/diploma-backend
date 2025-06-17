import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUserByPrivyAuth } from '../auth/decorator/get-user-by-privy-auth.decorator';
import { UseBearerTokenAuthGuard } from '../auth/guards/auth.guard';
import { UserEntity } from '../users/entities/user.entity';
import { ChatsService } from './chats.service';
import { ClearChatDto } from './dtos/clear-chat.dto';
import { CreateChatDto } from './dtos/create-chat.dto';
import { DeleteChatDto } from './dtos/delete-chat.dto';
import { SearchChatsDto } from './dtos/search-chats.dto';
import { UpdateChatDto } from './dtos/update-chat.dto';
import { ChatEntity } from './entities/chat.entity';

@ApiTags('chats')
@Controller('chats')
@ApiBearerAuth('access-token')
@UseBearerTokenAuthGuard()
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @ApiOperation({ summary: 'Create a new chat' })
  @Post()
  async createChat(
    @Body() dto: CreateChatDto,
    @GetUserByPrivyAuth() user: UserEntity,
  ): Promise<ChatEntity> {
    return await this.chatsService.createChat(dto, user);
  }

  @ApiOperation({ summary: 'Get all user chats without messages' })
  @Get()
  async getUserChats(@GetUserByPrivyAuth() user: UserEntity) {
    return this.chatsService.getUserChats(user);
  }

  @ApiOperation({ summary: 'Search chats by keyword in title' })
  @Get('search')
  async searchChats(
    @Query() dto: SearchChatsDto,
    @GetUserByPrivyAuth() user: UserEntity,
  ) {
    return this.chatsService.searchChatsByKeyword(dto, user);
  }

  @ApiOperation({ summary: 'Get a single chat with all its messages' })
  @Get(':chatId')
  async getChatWithMessages(@Param('chatId') chatId: string) {
    return this.chatsService.getChatWithMessages({ chatId });
  }

  @ApiOperation({ summary: 'Update chat title' })
  @Patch()
  async updateChat(@Body() dto: UpdateChatDto): Promise<ChatEntity> {
    return await this.chatsService.updateChatTitle(dto);
  }

  @ApiOperation({ summary: 'Delete a chat' })
  @Delete()
  async deleteChat(@Body() dto: DeleteChatDto): Promise<{ message: string }> {
    await this.chatsService.deleteChat(dto);
    return { message: 'Chat deleted' };
  }

  @ApiOperation({ summary: 'Delete all user chats' })
  @Delete('all')
  async deleteAllChats(
    @GetUserByPrivyAuth() user: UserEntity,
  ): Promise<{ message: string }> {
    await this.chatsService.deleteAllUserChats(user);
    return { message: 'All chats deleted' };
  }

  @ApiOperation({ summary: 'Clear all messages in a chat' })
  @Delete('clear')
  async clearChat(@Body() dto: ClearChatDto): Promise<{ message: string }> {
    await this.chatsService.clearChatMessages(dto);
    return { message: 'All messages cleared' };
  }
}
