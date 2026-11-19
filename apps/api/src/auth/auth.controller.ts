import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { problemResponse } from '../common/errors/problem-details.schema.js';
import { AuthService } from './auth.service.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { UserDto } from './dto/user.dto.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

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
  @ApiOkResponse({
    type: LoginResponseDto,
    headers: {
      'Set-Cookie': {
        description: `\`${REFRESH_COOKIE_NAME}\`: refresh token (HttpOnly; Secure; SameSite=Strict; Path=/auth).`,
        schema: { type: 'string' },
      },
    },
  })
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
}
