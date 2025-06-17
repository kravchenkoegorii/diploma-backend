import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const setupSwagger = (app: INestApplication) => {
  const config = new DocumentBuilder()
    .setTitle('Crypto AI API')
    .setVersion('0.0.1')
    .addBearerAuth(
      {
        name: 'authorization',
        description: 'Access token',
        in: 'header',
        type: 'apiKey',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);
};
