import { Module } from '@nestjs/common';
import { DexCronService } from './dex-cron.service';
import { CacheModule } from 'src/apps/api/modules/cache/cache.module';
import { DexModule } from '../../api/modules/dex/dex.module';

@Module({
  imports: [CacheModule, DexModule],
  providers: [DexCronService],
})
export class DexCronModule {}
