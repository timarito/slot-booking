import { Injectable } from '@nestjs/common';
import { argon2id, hash } from 'argon2';

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
  /** Соль генерируется случайно на каждый вызов и хранится внутри результата. */
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }
}
