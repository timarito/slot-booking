import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { problemResponse } from '../common/errors/problem-details.schema.js';
import { AuthService } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';
import { UserDto } from './dto/user.dto.js';

// Отдельный контроллер, потому что путь /me, а не /auth/me (spec.md, 6). Маршрут защищён
// глобальным JwtAuthGuard — здесь нет ни одного декоратора про авторизацию, и это нормально.
@ApiTags('auth')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse(
    problemResponse(
      'Missing, invalid or expired access token, or the user no longer exists (`unauthorized`).',
    ),
  )
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.authService.me(user.id);
  }
}
