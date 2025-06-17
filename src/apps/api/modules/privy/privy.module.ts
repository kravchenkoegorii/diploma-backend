import { PrivyService } from './privy.service';
import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { UsersModule } from '../users/users.module';
import { ViemModule } from '../viem/viem.module';

@Module({
  imports: [CacheModule, UsersModule, ViemModule],
  providers: [PrivyService],
  exports: [PrivyService],
})
export class PrivyModule {}
