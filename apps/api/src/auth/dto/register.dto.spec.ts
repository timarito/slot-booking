import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from './register.dto.js';

// Повторяет то, что делает ValidationPipe: JSON → экземпляр класса (здесь срабатывает @Transform)
// → валидация. Возвращает DTO и список полей с ошибками.
async function parse(
  body: Record<string, unknown>,
): Promise<{ dto: RegisterDto; invalid: string[] }> {
  const dto = plainToInstance(RegisterDto, body);
  const errors = await validate(dto);
  return { dto, invalid: errors.map((error) => error.property) };
}

const valid = { email: 'bob@example.com', password: 'password1', name: 'Bob' };

// Валидный по форме адрес заданной длины. Длину набираем доменом: часть до @ по RFC 5321
// не длиннее 64 символов, а метка домена — 63, иначе @IsEmail отклонил бы адрес раньше,
// чем дело дойдёт до проверки @MaxLength.
// Схема: 64 символа @ 63 . 63 . N .io — первые части дают 196 символов, N добирает остаток.
// Работает для длин 197–259, нам нужны 254 и 255.
function emailOfLength(length: number): string {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - 196)}.io`;
  if (email.length !== length) {
    throw new Error(`emailOfLength(${length}) built ${email.length} characters`);
  }
  return email;
}

describe('RegisterDto', () => {
  it('accepts a valid body', async () => {
    const { invalid } = await parse(valid);

    expect(invalid).toEqual([]);
  });

  it('normalizes the email before validating it', async () => {
    const { dto, invalid } = await parse({ ...valid, email: '  Bob@Example.COM ' });

    expect(invalid).toEqual([]);
    expect(dto.email).toBe('bob@example.com');
  });

  it('trims the name', async () => {
    const { dto } = await parse({ ...valid, name: '  Bob  ' });

    expect(dto.name).toBe('Bob');
  });

  it('rejects a name that is only whitespace', async () => {
    const { invalid } = await parse({ ...valid, name: '   ' });

    expect(invalid).toEqual(['name']);
  });

  it('keeps surrounding spaces in the password', async () => {
    const { dto } = await parse({ ...valid, password: ' password1 ' });

    expect(dto.password).toBe(' password1 ');
  });

  it.each([
    ['email', { email: 'not-an-email' }],
    // Ловят и @IsEmail, и @MaxLength: validator.js сам ограничивает адрес 254 символами.
    ['email', { email: emailOfLength(255) }],
    ['email', { email: 42 }],
    ['password', { password: 'short12' }],
    ['password', { password: 'a'.repeat(129) }],
    ['name', { name: 'a'.repeat(101) }],
  ])('rejects an invalid %s: %j', async (field, override) => {
    const { invalid } = await parse({ ...valid, ...override });

    expect(invalid).toEqual([field]);
  });

  it('accepts the boundary lengths', async () => {
    const { invalid } = await parse({
      email: emailOfLength(254),
      password: 'a'.repeat(8),
      name: 'a'.repeat(100),
    });

    expect(invalid).toEqual([]);
  });

  it('accepts a 128-character password', async () => {
    const { invalid } = await parse({ ...valid, password: 'a'.repeat(128) });

    expect(invalid).toEqual([]);
  });
});
