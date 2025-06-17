import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PromptService } from './prompt.service';
import { DexScreenerModule } from '../dex-screener/dex-screener.module';
import { DeFiLlamaModule } from '../defillama/defillama.module';
import { PrivyModule } from '../privy/privy.module';
import { KnowledgeRepository } from './repositories/knowledge.repositry';
import { DexModule } from '../dex/dex.module';
import { TokensModule } from '../tokens/tokens.module';
import { AlloraModule } from '../allora/allora.module';
import { ResponseService } from './response.service';
import { MessagesRepository } from '../messages/repositories/messages.repository';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DexScreenerModule,
    DeFiLlamaModule,
    PrivyModule,
    DexModule,
    TokensModule,
    AlloraModule,
  ],
  providers: [
    OpenAiService,
    PromptService,
    KnowledgeRepository,
    ResponseService,
    MessagesRepository,
  ],
  exports: [OpenAiService, PromptService, KnowledgeRepository],
})
export class OpenAiModule {}
