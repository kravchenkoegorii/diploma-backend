import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from 'src/common/configs/app.config';
import { AbstractSeed } from 'src/common/interfaces/seed/seed.interface';
import { ConfigNames } from 'src/common/types/enums/config-names.enum';
import { runWithQueryRunner } from 'src/common/utils/run-with-query-runner';
import { DataSource, ObjectLiteral } from 'typeorm';

@Injectable()
export class ApplicationSeedService {
  private readonly _logger = new Logger(ApplicationSeedService.name);

  constructor(
    private readonly _ds: DataSource,
    private readonly _configService: ConfigService,
  ) {}

  async plant() {
    const config = this._configService.getOrThrow<IAppConfig>(ConfigNames.APP);

    const seeds: AbstractSeed<ObjectLiteral>[] = [];
    if (config.isMainnet) {
      await this.plantMain(seeds);
    } else {
      await this.plantTest(seeds);
    }
  }

  private async plantTest(seeds: AbstractSeed<ObjectLiteral>[]) {
    try {
      await runWithQueryRunner(this._ds, async (qr) => {
        for (let i = 0; i < seeds.length; i++) {
          await seeds[i].plantTest(qr);
        }
      });
    } catch (error) {
      this._logger.error(error);
    }
  }

  private async plantMain(seeds: AbstractSeed<ObjectLiteral>[]) {
    try {
      await runWithQueryRunner(this._ds, async (qr) => {
        for (let i = 0; i < seeds.length; i++) {
          await seeds[i].plantMain(qr);
        }
      });
    } catch (error) {
      this._logger.error(error);
    }
  }
}
