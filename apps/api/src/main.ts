import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';

// Точка входа. Выполняется один раз на процесс: собирает DI-контейнер, затем запускает HTTP-сервер.
// После этого процесс просто ждёт запросов; event loop Node обрабатывает многие из них
// одновременно в одном потоке, потому что большая часть времени уходит на ожидание I/O (БД).
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  // CORS: браузер блокирует ответы с чужого origin, если сервер их явно не разрешил.
  // Точный origin + credentials, потому что refresh-токен будет передаваться в cookie (M2).
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
  });

  // По SIGTERM (docker stop, деплой) Nest вызывает хуки onModuleDestroy: пул соединений с БД
  // закрывается аккуратно, а не обрывается посреди запроса.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
