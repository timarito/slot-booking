import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

// Entry point. Runs once per process: builds the DI container, then starts the HTTP server.
// After that the process just waits for requests; Node's event loop handles many of them
// concurrently on one thread, because most of the time is spent waiting on I/O (the DB).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  // CORS: the browser blocks cross-origin responses unless the server allows them.
  // Exact origin + credentials, because the refresh token will travel in a cookie (M2).
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  // On SIGTERM (docker stop, deploy) Nest runs onModuleDestroy hooks: the DB pool is closed
  // cleanly instead of being cut mid-query.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
