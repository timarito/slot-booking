import type { ValidationError } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { flattenValidationErrors } from './validation.js';

// Builds the minimal shape class-validator produces.
function error(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('flattenValidationErrors', () => {
  it('returns one entry per violated constraint', () => {
    const result = flattenValidationErrors([
      error('email', {
        isEmail: 'email must be an email',
        isNotEmpty: 'email should not be empty',
      }),
      error('name', { maxLength: 'name must be shorter than or equal to 100 characters' }),
    ]);

    expect(result).toEqual([
      { field: 'email', message: 'email must be an email' },
      { field: 'email', message: 'email should not be empty' },
      { field: 'name', message: 'name must be shorter than or equal to 100 characters' },
    ]);
  });

  it('builds dot paths for nested objects and arrays', () => {
    const result = flattenValidationErrors([
      error('workingHours', undefined, [
        error('0', undefined, [error('openTime', { matches: 'openTime must be HH:mm' })]),
      ]),
    ]);

    expect(result).toEqual([
      { field: 'workingHours.0.openTime', message: 'openTime must be HH:mm' },
    ]);
  });

  it('returns an empty list for no errors', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});
