import { verify } from 'argon2';
import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

// Настоящий argon2 (без моков): тест проверяет, что параметры реально применяются.
describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('produces an argon2id hash with the configured parameters', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('produces a hash that verifies only against the original password', async () => {
    const hash = await hasher.hash('correct horse battery staple');

    await expect(verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verify(hash, 'Correct horse battery staple')).resolves.toBe(false);
  });

  // Случайная соль: одинаковые пароли дают разные хеши, поэтому по дампу БД
  // нельзя понять, у каких пользователей пароль совпадает.
  it('salts every hash, so equal passwords give different hashes', async () => {
    const [first, second] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);

    expect(first).not.toBe(second);
  });
});
