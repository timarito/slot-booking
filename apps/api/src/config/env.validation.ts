import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

// Fail fast: с битым конфигом приложение должно отказаться стартовать, а не упасть на первом
// запросе, которому понадобилась отсутствующая переменная (spec.md, раздел 9).

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

// Уровни pino; 'silent' выключает логи полностью (по умолчанию в тестах).
export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const DEFAULT_LOG_LEVEL: Record<NodeEnv, LogLevel> = {
  [NodeEnv.Development]: 'debug',
  [NodeEnv.Test]: 'silent',
  [NodeEnv.Production]: 'info',
};

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

  // Необязательная: по умолчанию зависит от NODE_ENV (см. DEFAULT_LOG_LEVEL). Нужна, чтобы
  // временно включить debug в проде без пересборки — только перезапуском с другим env.
  @IsOptional()
  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel;
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
  // Значение по умолчанию зависит от другого поля, поэтому задаётся после валидации,
  // а не инициализатором поля класса.
  validated.LOG_LEVEL ??= DEFAULT_LOG_LEVEL[validated.NODE_ENV];
  return validated;
}
