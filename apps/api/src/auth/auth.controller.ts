import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { problemResponse } from '../common/errors/problem-details.schema.js';
import { AuthService } from './auth.service.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UserDto } from './dto/user.dto.js';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_SECURITY,
  clearRefreshCookieOptions,
  readRefreshCookie,
  refreshCookieOptions,
} from './refresh-cookie.js';

const SET_REFRESH_COOKIE_HEADER = {
  'Set-Cookie': {
    description: `\`${REFRESH_COOKIE_NAME}\`: refresh token (HttpOnly; Secure; SameSite=Strict; Path=/auth).`,
    schema: { type: 'string' },
  },
};

// Контроллер тонкий: принимает HTTP, отдаёт сервису уже провалидированный DTO.
// Валидацию делает глобальный ValidationPipe до вызова метода, ошибки форматирует глобальный фильтр.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @Post по умолчанию отвечает 201 Created — то, что нужно при создании ресурса.
  @Post('register')
  @ApiCreatedResponse({ type: UserDto })
  @ApiBadRequestResponse(problemResponse('Invalid input (`validation-error`).'))
  @ApiConflictResponse(problemResponse('The email is already registered (`email-taken`).'))
  register(@Body() dto: RegisterDto): Promise<UserDto> {
    return this.authService.register(dto);
  }

  // Вход — действие, а не создание ресурса для клиента, поэтому 200 (spec.md, раздел 6).
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto, headers: SET_REFRESH_COOKIE_HEADER })
  @ApiBadRequestResponse(problemResponse('Invalid input (`validation-error`).'))
  @ApiUnauthorizedResponse(problemResponse('Wrong email or password (`invalid-credentials`).'))
  async login(
    @Body() dto: LoginDto,
    // passthrough: true — мы только ставим cookie, а ответ по-прежнему формирует Nest
    // из возвращаемого значения (сериализация, интерсепторы). Без него пришлось бы вызывать
    // res.json() вручную и Nest перестал бы управлять ответом.
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, user, refreshToken, refreshTokenExpiresAt } =
      await this.authService.login(dto);

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshTokenExpiresAt));
    return { accessToken, user };
  }

  // Тела у запроса нет: единственный «аргумент» — httpOnly cookie, которую браузер прикладывает сам.
  // Ответ той же формы, что у login: фронтенд при загрузке страницы вызывает refresh
  // и сразу получает и токен, и пользователя (spec.md, 7).
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_SECURITY)
  @ApiOkResponse({ type: LoginResponseDto, headers: SET_REFRESH_COOKIE_HEADER })
  @ApiUnauthorizedResponse(
    problemResponse('Missing, expired or revoked refresh token (`refresh-token-invalid`).'),
  )
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, user, refreshToken, refreshTokenExpiresAt } =
      await this.authService.refresh(readRefreshCookie(req));

    // Та же cookie с тем же Path перезаписывает старую: в браузере всегда один актуальный токен.
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions(refreshTokenExpiresAt));
    return { accessToken, user };
  }

  // 204 — действие выполнено, возвращать нечего. Ответ всегда успешный, даже без cookie или
  // с уже отозванным токеном: логаут идемпотентен, повторный вызов не должен пугать клиента ошибкой.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_SECURITY)
  @ApiNoContentResponse({
    description: 'Session ended. Always succeeds, even without a valid refresh token.',
    headers: {
      'Set-Cookie': {
        description: `Clears \`${REFRESH_COOKIE_NAME}\` (expired, Path=/auth).`,
        schema: { type: 'string' },
      },
    },
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(readRefreshCookie(req));
    // Главное — отзыв в БД, очистка cookie — вежливость: даже если браузер её не удалит
    // (или клиент сохранил токен), обменять его уже не получится.
    res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
  }
}
