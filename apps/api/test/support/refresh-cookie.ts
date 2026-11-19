import { REFRESH_COOKIE_NAME } from '../../src/auth/refresh-cookie.js';

/** Достаёт cookie с refresh-токеном из заголовков ответа: значение и атрибуты по отдельности. */
export function refreshCookie(setCookie: string[] | string | undefined) {
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  const header = [setCookie ?? []].flat().find((cookie) => cookie.startsWith(prefix));
  if (header === undefined) {
    throw new Error(`${REFRESH_COOKIE_NAME} cookie was not set`);
  }
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  return { value: pair.slice(prefix.length), attributes };
}

/** Заголовок Cookie запроса так, как его отправил бы браузер. */
export function cookieHeader(refreshToken: string): string {
  return `${REFRESH_COOKIE_NAME}=${refreshToken}`;
}
