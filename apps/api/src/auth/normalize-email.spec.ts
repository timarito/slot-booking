import { describe, expect, it } from 'vitest';
import { normalizeEmail } from './normalize-email.js';

describe('normalizeEmail', () => {
  it('lowercases the whole address', () => {
    expect(normalizeEmail('Bob.Smith@Example.COM')).toBe('bob.smith@example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  bob@example.com\t\n')).toBe('bob@example.com');
  });

  it('leaves an already normalized address unchanged', () => {
    expect(normalizeEmail('bob@example.com')).toBe('bob@example.com');
  });
});
