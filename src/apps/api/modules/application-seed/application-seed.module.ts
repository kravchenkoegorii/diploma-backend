import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ApplicationSeedService } from './application-seed.service';

@Module({
  imports: [],
  providers: [ApplicationSeedService],
})
export class ApplicationSeedModule implements OnApplicationBootstrap {
  constructor(private readonly seedService: ApplicationSeedService) {}

  async onApplicationBootstrap() {
    await this.seedService.plant();
  }
}
