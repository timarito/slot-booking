import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

// Базовая конфигурация OWASP для argon2id: 19 MiB памяти, 2 прохода, 1 поток
// (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
// argon2 намеренно дорогой по памяти: перебор паролей на GPU упирается в память, а не в ядра.
// Не берём дефолты библиотеки (64 MiB, t=3, p=4): каждый одновременный вход занимал бы 64 MiB,
// и небольшой сервер с парой сотен параллельных логинов упёрся бы в память.
// Параметры записываются внутрь хеша ($argon2id$v=19$m=19456,t=2,p=1$...), поэтому их можно
// поднять позже: старые хеши продолжат проверяться со своими параметрами.
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Обёртка над argon2 как провайдер DI: параметры хеширования живут в одном месте,
 * а unit-тесты сервисов подменяют её быстрой фейковой реализацией.
 */
@Injectable()
export class PasswordHasher {
  // Хеш случайного пароля, который никто не знает. Нужен, чтобы вход с несуществующим email
  // тратил столько же времени, сколько вход с неверным паролем (см. verify).
  // Считается один раз при создании провайдера, а не на первом запросе: иначе первый такой
  // запрос был бы вдвое медленнее и всё равно выдавал бы разницу.
  private readonly dummyHash: Promise<string> = this.hash(randomBytes(32).toString('hex'));

  /** Соль генерируется случайно на каждый вызов и хранится внутри результата. */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Проверяет пароль против хеша. `undefined` означает «пользователь не найден»: тогда проверка
   * всё равно выполняется (против dummyHash) и возвращает false. Без этого ответ для чужого email
   * приходил бы за ~1 мс, а для существующего — за ~30 мс, и по времени ответа можно было бы
   * перебором выяснить, какие email зарегистрированы (user enumeration через тайминг-атаку).
   */
  async verify(passwordHash: string | undefined, password: string): Promise<boolean> {
    if (passwordHash === undefined) {
      await verify(await this.dummyHash, password);
      return false;
    }
    return verify(passwordHash, password);
  }
}
