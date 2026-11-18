import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException, type FieldError } from './problem-details.js';

/**
 * class-validator возвращает ДЕРЕВО ошибок (вложенные DTO, массивы). Клиенту нужен плоский список
 * с путями через точку, который можно сопоставить с полями формы: `workingHours.0.openTime`.
 */
export function flattenValidationErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    const nested = flattenValidationErrors(error.children ?? [], field);
    return [...own, ...nested];
  });
}

/**
 * Глобальный ValidationPipe: валидирует каждый DTO из @Body()/@Query()/@Param() до вызова обработчика.
 * Единственная настройка здесь — форма ошибки: `validation-error` с `errors[]` (spec.md, раздел 7).
 * Опции, связанные с DTO (whitelist, transform...), решим вместе с первыми DTO в M2.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: (errors) =>
      new AppException(HttpStatus.BAD_REQUEST, 'validation-error', {
        title: 'Validation failed',
        detail: 'One or more fields are invalid.',
        errors: flattenValidationErrors(errors),
      }),
  });
}
