import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/' });

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // A trailing slash in FRONTEND_URL (e.g. "https://foo.vercel.app/") is a
  // one-character typo that silently CORS-blocks that origin forever — a
  // real browser's Origin header never has a trailing slash (it's just
  // scheme+host+port, no path), so an exact-match comparison against a
  // slash-terminated allowlist entry never succeeds. Stripped on both sides
  // so this can't recur from a future copy-paste.
  const stripTrailingSlash = (url: string) => url.replace(/\/+$/, '');
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => stripTrailingSlash(o.trim()));

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const isDev = process.env.NODE_ENV === 'development';
      const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
      const normalizedOrigin = stripTrailingSlash(origin ?? '');
      if (!origin || allowedOrigins.includes(normalizedOrigin) || (isDev && isLocalhost)) {
        callback(null, true);
      } else {
        // Reject cleanly (no CORS headers, no thrown error) rather than surfacing
        // a 500 — the browser blocks it either way, but this avoids masking real
        // server errors as CORS rejections and keeps them out of error tracking.
        callback(null, false);
      }
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Janak Positioning API')
    .setDescription('Backend API for Janak Positioning B2B e-commerce app')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
