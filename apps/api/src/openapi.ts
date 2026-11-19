import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_SECURITY } from './auth/refresh-cookie.js';
import { PROBLEM_DETAILS_MODELS, problemResponse } from './common/errors/problem-details.schema.js';

// Путь Swagger UI. JSON-спецификация — по `${OPENAPI_PATH}-json` (так по умолчанию в @nestjs/swagger).
export const OPENAPI_PATH = 'docs';

/**
 * Собирает OpenAPI-документ из метаданных контроллеров и DTO.
 * Спецификация генерируется из кода, поэтому она не может устареть относительно реальных маршрутов:
 * это единственный источник правды о контракте, из него фронтенд генерирует типы.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('slot-booking API')
    .setDescription('Booking of shared resources (meeting rooms, desks) in time slots.')
    .setVersion('0.1.0')
    // `default` в OpenAPI — «любой статус, не описанный явно». Все ошибки у нас в одном формате
    // (глобальный фильтр), поэтому это правда для каждого эндпоинта, и описывать её на каждом не нужно.
    .addGlobalResponse({
      status: 'default',
      ...problemResponse('Error (RFC 9457 Problem Details).'),
    })
    // Схема «аутентификация cookie»: эндпоинты с @ApiCookieAuth(REFRESH_COOKIE_SECURITY)
    // помечаются в документе как требующие refresh-cookie.
    .addCookieAuth(REFRESH_COOKIE_NAME, { type: 'apiKey' }, REFRESH_COOKIE_SECURITY)
    .build();

  return SwaggerModule.createDocument(app, config, { extraModels: PROBLEM_DETAILS_MODELS });
}

/** Подключает Swagger UI (`/docs`) и JSON-спецификацию (`/docs-json`). */
export function setupOpenApi(app: INestApplication): void {
  // Фабрика вместо готового документа: документ строится при первом запросе, а не при старте.
  SwaggerModule.setup(OPENAPI_PATH, app, () => buildOpenApiDocument(app), {
    // YAML не нужен: генератор типов на фронтенде читает JSON.
    raw: ['json'],
  });
}
