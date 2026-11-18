import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

// Fail fast: с битым конфигом приложение должно отказаться стартовать, а не упасть на первом
// запросе, которому понадобилась отсутствующая переменная (spec.md, раздел 9).

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  // Не @IsUrl: проверка URL в class-validator по умолчанию отклоняет схему "postgresql://".
  @IsString()
  DATABASE_URL: string;

  @IsUrl({ require_tld: false })
  CORS_ORIGIN: string;
}

// Вызывается ConfigModule с «сырым» process.env (все значения — строки).
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // enableImplicitConversion превращает "3000" в 3000 по объявленному типу поля.
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return validated;
}
