import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

// Fail fast: the app must refuse to start with a broken config rather than crash
// on the first request that happens to need a missing variable (spec, section 9).

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

  // Not @IsUrl: class-validator's URL check rejects "postgresql://" schemes by default.
  @IsString()
  DATABASE_URL: string;

  @IsUrl({ require_tld: false })
  CORS_ORIGIN: string;
}

// Called by ConfigModule with the raw process.env (all values are strings).
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // enableImplicitConversion turns "3000" into 3000 based on the declared field type.
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
