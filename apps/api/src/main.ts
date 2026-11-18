import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/env.validation.js';
import { REQUEST_ID_HEADER } from './logging/request-id.js';

// Точка входа. Выполняется один раз на процесс: собирает DI-контейнер, затем запускает HTTP-сервер.
// После этого процесс просто ждёт запросов; event loop Node обрабатывает многие из них
// одновременно в одном потоке, потому что большая часть времени уходит на ожидание I/O (БД).
async function bootstrap(): Promise<void> {
  // bufferLogs: логи, написанные во время сборки приложения (до useLogger ниже), не уходят
  // встроенному логгеру Nest, а копятся и потом выводятся уже через pino — единым форматом.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Все логи Nest (и `new Logger(...)` в нашем коде) теперь идут через pino.
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<EnvironmentVariables, true>);

  // CORS: браузер блокирует ответы с чужого origin, если сервер их явно не разрешил.
  // Точный origin + credentials, потому что refresh-токен будет передаваться в cookie (M2).
  // exposedHeaders: по умолчанию JS на фронте не видит нестандартные заголовки cross-origin
  // ответа; X-Request-Id нужен, чтобы показать его пользователю при ошибке.
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  // По SIGTERM (docker stop, деплой) Nest вызывает хуки onModuleDestroy: пул соединений с БД
  // закрывается аккуратно, а не обрывается посреди запроса.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
