import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Снимает с маршрута (или всего контроллера) глобальный JwtAuthGuard.
 * Защита включена по умолчанию, а публичность — явное исключение: забытый декоратор
 * закрывает эндпоинт (заметно сразу, 401 в тестах), а не открывает его (заметно после утечки).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
