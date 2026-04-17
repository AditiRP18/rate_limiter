import dotenv from 'dotenv';

dotenv.config();

function parseNumber(name: string, value: string | undefined): number {
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    throw new Error(`Invalid number for env var ${name}: ${value}`);
  }
  return parsed;
}

export interface AppConfig {
  port: number;
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  rateLimit: {
    capacity: number;
    refillRate: number; // tokens per second
  };
  nodeEnv: 'development' | 'test' | 'production';
}

function getNodeEnv(): AppConfig['nodeEnv'] {
  const raw = process.env.NODE_ENV;
  if (raw === 'production') return 'production';
  if (raw === 'test') return 'test';
  return 'development';
}

export const config: AppConfig = {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: process.env.REDIS_PORT ? parseNumber('REDIS_PORT', process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined
  },
  rateLimit: {
    capacity: process.env.RATE_LIMIT_CAPACITY
      ? parseNumber('RATE_LIMIT_CAPACITY', process.env.RATE_LIMIT_CAPACITY)
      : 10,
    refillRate: process.env.RATE_LIMIT_REFILL_RATE
      ? parseNumber('RATE_LIMIT_REFILL_RATE', process.env.RATE_LIMIT_REFILL_RATE)
      : 2
  },
  nodeEnv: getNodeEnv()
};

