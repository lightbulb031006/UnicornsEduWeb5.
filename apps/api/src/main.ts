import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';

// Prefer IPv4 when resolving Supabase pooler hostnames (VPS without IPv6 route).
setDefaultResultOrder('ipv4first');

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

function parseTrustProxy(
  value: string | undefined,
): boolean | number | string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isNaN(parsedValue)) {
    return parsedValue;
  }

  return normalizedValue;
}

function normalizeCorsOrigin(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim().replace(/\/+$/, '');
  return normalizedValue || undefined;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: normalizeCorsOrigin(process.env.FRONTEND_URL),
      credentials: true,
    },
    rawBody: true,
  });
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Unicorns Edu API')
    .setDescription('API backend cho Unicorns Edu 5.0')
    .setVersion('1.0')
    .addCookieAuth('access_token', {
      description: 'Access token for authentication',
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      in: 'cookie',
    })
    .addCookieAuth('refresh_token', {
      description: 'Refresh token for authentication',
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      in: 'cookie',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
