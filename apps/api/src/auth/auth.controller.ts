import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiTags,
} from '@nestjs/swagger';
import { problemResponse } from '../common/errors/problem-details.schema.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { UserDto } from './dto/user.dto.js';

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
}
