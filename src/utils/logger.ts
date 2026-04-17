import util from 'util';

type LogLevel = 'info' | 'warn' | 'error';

function format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const time = new Date().toISOString();
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify({ time, level, message, ...(meta ?? {}) });
  }

  const prettyMeta = meta ? util.inspect(meta, { colors: true, depth: null }) : '';
  return `[${time}] ${level.toUpperCase()}: ${message}${prettyMeta ? ` | ${prettyMeta}` : ''}`;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const line = format(level, message, meta);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger: {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
} = {
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta)
};

