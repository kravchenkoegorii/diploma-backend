import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { CustomExceptionFilter } from '../../common/exceptions/custom-exptectation-filter';
import { customExpectaionFactory } from '../../common/utils/custom-expectation-factory';
import { setupSwagger } from '../../common/utils/setup-swagger';
import { mw as ipMiddleware } from 'request-ip';
import * as cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { IAppConfig } from '../../common/configs/app.config';
import { ConfigNames } from '../../common/types/enums/config-names.enum';
import { useContainer } from 'class-validator';

BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: customExpectaionFactory,
    }),
  );
  app.useGlobalFilters(new CustomExceptionFilter());
  app.use(ipMiddleware());
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: true,
  });

  setupSwagger(app);

  const configService = app.get(ConfigService);
  const config = configService.get<IAppConfig>(ConfigNames.APP);

  if (!config) {
    throw new Error('App config does not exists');
  }

  const logger = new Logger('App');

  await app.listen(config.port, '0.0.0.0', async () => {
    logger.log(`Service "Cron" started on ${await app.getUrl()}`);
  });
}

bootstrap();
