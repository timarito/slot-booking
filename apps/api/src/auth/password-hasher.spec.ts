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

  describe('verify', () => {
    it('accepts the right password and rejects a wrong one', async () => {
      const hash = await hasher.hash('correct horse battery staple');

      await expect(hasher.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
      await expect(hasher.verify(hash, 'wrong')).resolves.toBe(false);
    });

    it('returns false when there is no user (no stored hash)', async () => {
      await expect(hasher.verify(undefined, 'anything')).resolves.toBe(false);
    });

    // Сама защита от тайминг-атаки: «нет пользователя» стоит столько же, сколько настоящая
    // проверка, потому что внутри выполняется argon2 с теми же параметрами. Сравниваем
    // с большим запасом, чтобы тест не мигал на медленной машине CI: без dummy-проверки
    // разница была бы в десятки раз (≈0 мс против десятков мс).
    it('spends comparable time when there is no user as for a wrong password', async () => {
      const hash = await hasher.hash('correct horse battery staple');
      await hasher.verify(undefined, 'warm-up');

      const time = async (run: () => Promise<boolean>): Promise<number> => {
        const start = performance.now();
        await run();
        return performance.now() - start;
      };
      const wrongPassword = await time(() => hasher.verify(hash, 'wrong'));
      const noUser = await time(() => hasher.verify(undefined, 'wrong'));

      expect(noUser).toBeGreaterThan(wrongPassword / 3);
    });
  });
});
