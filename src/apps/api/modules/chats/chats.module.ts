import { Module } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsRepository } from './repositories/chats.repository';
import { ChatsService } from './chats.service';
import { UsersModule } from '../users/users.module';
import { MessagesRepository } from '../messages/repositories/messages.repository';
import { OpenAiModule } from '../openai/openai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UsersModule, OpenAiModule, AuthModule],
  controllers: [ChatsController],
  providers: [ChatsRepository, ChatsService, MessagesRepository],
  exports: [ChatsRepository],
})
export class ChatsModule {}
