/**
 * Каноническая форма email: без пробелов по краям и в нижнем регистре (spec.md, 3.1).
 * Email уникален без учёта регистра, поэтому `Bob@X.com` и `bob@x.com` — один аккаунт.
 * Применяется на входе и при регистрации, и при входе: иначе пользователь, указавший
 * при входе другой регистр, не найдётся.
 *
 * Строго говоря, RFC 5321 разрешает регистрозависимую локальную часть (до @), но на практике
 * почтовые сервисы её не различают, а пользователи путают регистр. Это общепринятый компромисс.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * То же для `@Transform` в DTO. Нестроковое значение пропускаем как есть:
 * его отклонит валидатор типа (@IsEmail / @IsString) с понятной ошибкой.
 */
export function toNormalizedEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
