import Redis from 'ioredis';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import type { ClientStats } from '../types';

const KEY_PREFIX = 'rate_limit:';

const LUA_TOKEN_BUCKET = `
  local capacity = tonumber(ARGV[1])
  local refillRate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens'))
  local lastRefill = tonumber(redis.call('HGET', KEYS[1], 'lastRefill'))

  if tokens == nil then tokens = capacity end
  if lastRefill == nil then lastRefill = now end

  if refillRate <= 0 then
    local allowed = tokens >= 1 and 1 or 0
    if allowed == 1 then
      tokens = tokens - 1
    end
    redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'lastRefill', tostring(now))
    return {allowed, tokens, now}
  end

  local elapsedMs = now - lastRefill
  if elapsedMs < 0 then elapsedMs = 0 end
  local tokensToAdd = (elapsedMs / 1000.0) * refillRate
  local newTokens = math.min(capacity, tokens + tokensToAdd)

  local allowed = 0
  local remaining = newTokens
  if newTokens >= 1.0 then
    remaining = newTokens - 1.0
    allowed = 1
  end

  redis.call('HSET', KEYS[1], 'tokens', tostring(remaining), 'lastRefill', tostring(now))

  local deficit = capacity - remaining
  local resetMs = now
  if refillRate > 0 and deficit > 0 then
    local secondsToFull = deficit / refillRate
    resetMs = now + math.ceil(secondsToFull * 1000.0)
  end

  return {allowed, remaining, resetMs}
`;

let client: Redis | null = null;
let luaDefined = false;
let loggedRedisError = false;

export function getRedisClient(): Redis {
  if (client) return client;

  client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1
  });

  client.on('error', (err: Error) => {
    if (!loggedRedisError) {
      logger.error('Redis error', { error: err.message || 'unknown' });
      loggedRedisError = true;
    }
  });

  if (!luaDefined) {
    client.defineCommand('consumeTokens', {
      numberOfKeys: 1,
      lua: LUA_TOKEN_BUCKET
    });
    luaDefined = true;
  }

  return client;
}

export function getRateLimitKey(clientId: string): string {
  return `${KEY_PREFIX}${clientId}`;
}

export async function getClientStats(clientId: string): Promise<ClientStats> {
  const redis = getRedisClient();
  const key = getRateLimitKey(clientId);
  const [tokensRaw, lastRefillRaw] = await redis.hmget(key, 'tokens', 'lastRefill');

  const tokens =
    tokensRaw === null ? config.rateLimit.capacity : Number(tokensRaw);
  const lastRefill = lastRefillRaw === null ? 0 : Number(lastRefillRaw);

  return {
    clientId,
    tokens: Number.isFinite(tokens) ? tokens : config.rateLimit.capacity,
    lastRefill: Number.isFinite(lastRefill) ? lastRefill : 0,
    capacity: config.rateLimit.capacity,
    refillRate: config.rateLimit.refillRate
  };
}

export async function listActiveClientIds(scanCount = 1000): Promise<string[]> {
  const redis = getRedisClient();
  let cursor = '0';
  const ids: string[] = [];
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${KEY_PREFIX}*`,
      'COUNT',
      scanCount
    );
    cursor = nextCursor;
    const keyStrs = keys as string[];
    for (const key of keyStrs) {
      if (key.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length));
    }
  } while (cursor !== '0');

  return ids;
}

export async function listActiveClientStats(): Promise<ClientStats[]> {
  const ids = await listActiveClientIds();
  const stats: ClientStats[] = [];
  for (const id of ids) {
    stats.push(await getClientStats(id));
  }
  return stats;
}

export async function resetClientBucket(clientId: string): Promise<number> {
  const redis = getRedisClient();
  const key = getRateLimitKey(clientId);
  return redis.del(key);
}

export async function shutdownRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client.removeAllListeners();
  client = null;
  luaDefined = false;
  loggedRedisError = false;
}

export async function pingRedis(timeoutMs = 2000): Promise<boolean> {
  const redis = getRedisClient();
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Redis ping timeout')), timeoutMs);
  });
  try {
    await Promise.race([redis.ping(), timeout]);
    if (timeoutId) clearTimeout(timeoutId);
    return true;
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    return false;
  }
}

