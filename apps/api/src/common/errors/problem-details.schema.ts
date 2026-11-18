import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiResponseNoStatusOptions,
  ApiSchema,
  getSchemaPath,
} from '@nestjs/swagger';
import { type FieldError, PROBLEM_CONTENT_TYPE, type ProblemDetails } from './problem-details.js';

// Классы только для OpenAPI: интерфейсы TS стираются при компиляции, а @nestjs/swagger строит схемы
// по метаданным декораторов на классах. `implements` заставляет компилятор следить, чтобы схема
// не разошлась с типом, который реально отдаёт фильтр (поле убрали из интерфейса — здесь ошибка).
// @ApiSchema задаёт имя схемы в спецификации: фронтенд получит тип `ProblemDetails`, а не `...Schema`.

@ApiSchema({ name: 'FieldError' })
export class FieldErrorSchema implements FieldError {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'email must be an email' })
  message: string;
}

@ApiSchema({ name: 'ProblemDetails', description: 'RFC 9457 Problem Details.' })
export class ProblemDetailsSchema implements ProblemDetails {
  @ApiProperty({ example: '/problems/validation-error' })
  type: string;

  @ApiProperty({ example: 'Bad Request' })
  title: string;

  @ApiProperty({ example: 400 })
  status: number;

  @ApiPropertyOptional()
  detail?: string;

  @ApiProperty({ example: '/bookings' })
  instance: string;

  @ApiProperty({
    description: 'Stable machine-readable error code; the client maps it to a UI message.',
    example: 'validation-error',
  })
  code: string;

  @ApiPropertyOptional({ type: [FieldErrorSchema], description: 'Only for validation errors.' })
  errors?: FieldError[];
}

/** Классы, которые нужно явно зарегистрировать в документе: на них ссылаются через $ref. */
export const PROBLEM_DETAILS_MODELS = [ProblemDetailsSchema, FieldErrorSchema];

/**
 * Описание ответа-ошибки для @ApiXxxResponse() и addGlobalResponse().
 * Через `content`, а не `type`: так указывается правильный media type `application/problem+json`
 * (с `type` swagger записал бы `application/json`, и сгенерированный клиент ждал бы не то).
 */
export function problemResponse(description: string): ApiResponseNoStatusOptions {
  return {
    description,
    content: {
      [PROBLEM_CONTENT_TYPE]: { schema: { $ref: getSchemaPath(ProblemDetailsSchema) } },
    },
  };
}
