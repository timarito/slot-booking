import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './user.dto.js';

/**
 * Тело ответа на вход. Refresh-токена здесь нет: он уходит только в httpOnly cookie,
 * чтобы JS на странице (и XSS) не мог его прочитать.
 */
export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT for the Authorization: Bearer header. Keep it in memory only.',
  })
  accessToken: string;

  // Пользователь сразу в ответе: фронтенду не нужен отдельный GET /me после входа.
  @ApiProperty({ type: UserDto })
  user: UserDto;
}
