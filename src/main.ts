import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ limit: '10mb', extended: true }));

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalInterceptors(new ResponseInterceptor());

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: false,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  const url = process.env.APP_URL || `http://localhost:${port}`;
  
  logger.log(`🚀 Application is running on: ${url}/api/v1`);
}
bootstrap();
