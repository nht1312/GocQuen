// Must come first: AppConfig reads process.env eagerly.
import { loadedEnvFile } from './config/load-env';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  if (loadedEnvFile) new Logger('Bootstrap').log(`Loaded environment from ${loadedEnvFile}`);

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfig);
  config.validate();

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Minimal hardening; a reverse proxy should add HSTS and TLS termination.
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    // Correlation id for structured logs (SPEC 16.4). Never logs bodies.
    const requestId = (request.headers['x-request-id'] as string) ?? Math.random().toString(36).slice(2);
    response.setHeader('x-request-id', requestId);
    next();
  });

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Virtual Café server listening on :${config.port} ` +
      `(capacity ${config.instanceCapacity}/instance, voice ${config.voiceAvailable ? 'on' : 'off'})`,
  );
}

void bootstrap();
