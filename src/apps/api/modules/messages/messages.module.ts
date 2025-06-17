import { Module } from '@nestjs/common';
import { MessagesRepository } from './repositories/messages.repository';
import { UsersModule } from '../users/users.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatsRepository } from '../chats/repositories/chats.repository';
import { OpenAiModule } from '../openai/openai.module';
import { AuthModule } from '../auth/auth.module';
import { AerodromeModule } from '../aerodrome/aerodrome.module';
import { CacheModule } from '../cache/cache.module';
import { ViemModule } from '../viem/viem.module';

@Module({
  imports: [
    CacheModule,
    UsersModule,
    OpenAiModule,
    AuthModule,
    AerodromeModule,
    ViemModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesRepository, MessagesService, ChatsRepository],
  exports: [MessagesService, MessagesRepository],
})
export class MessagesModule {}
