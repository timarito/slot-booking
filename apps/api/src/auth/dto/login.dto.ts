import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../normalize-email.js';

// Валидация при входе намеренно мягче, чем при регистрации:
// - нет @IsEmail: кривой email просто не найдётся и даст тот же 401, что и неверный пароль;
// - нет @MinLength(8) для пароля: правила сложности могут ужесточиться, а пользователи
//   со старыми паролями должны по-прежнему входить.
// Верхние границы остаются: они защищают от DoS (argon2 от мегабайтной строки).
export class LoginDto {
  @ApiProperty({ example: 'bob@example.com' })
  @Transform(toNormalizedEmail)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
