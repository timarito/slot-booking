import { HttpStatus, ValidationPipe, type ValidationError } from '@nestjs/common';
import { AppException, type FieldError } from './problem-details.js';

/**
 * class-validator returns a TREE of errors (nested DTOs, arrays). The client needs a flat list
 * with dot paths it can map onto form fields: `workingHours.0.openTime`.
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
 * The global ValidationPipe: validates every @Body()/@Query()/@Param() DTO before the handler runs.
 * Its only customization here is the error shape — `validation-error` with `errors[]` (spec.md, 7).
 * DTO-related options (whitelist, transform...) will be decided with the first DTOs in M2.
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
