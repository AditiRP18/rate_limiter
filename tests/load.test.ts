import request from 'supertest';
import { createApp } from '../src/app';
import {
  pingRedis,
  resetClientBucket,
  shutdownRedis
} from '../src/services/redisService';

const capacity = 10;
const refillRate = 2;

describe('RateLimiter Lua atomicity under burst load', () => {
  const app = createApp({
    rateLimiterOptions: {
      capacity,
      refillRate,
      clientIdExtractor: (req) =>
        (req.headers['x-client-id'] as string | undefined) ??
        req.ip ??
        req.socket.remoteAddress ??
        'unknown'
    }
  }) as unknown as Parameters<typeof request>[0];

  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await pingRedis(2000);
    if (!redisAvailable) {
      await shutdownRedis();
    }
  });

  afterAll(async () => {
    await shutdownRedis();
  });

  test('20 concurrent requests yield exactly capacity allows', async () => {
    if (!redisAvailable) return;
    await resetClientBucket('burst-client');

    const clientId = 'burst-client';
    const reqCount = 20;

    const startedAt = Date.now();

    const results = await Promise.all(
      Array.from({ length: reqCount }, async (_, i) => {
        const resolvedAt = Date.now();
        const res = await request(app)
          .get('/api/hello')
          .set('x-client-id', clientId);
        return { i, status: res.status, resolvedAt, durationMs: Date.now() - startedAt };
      })
    );

    const ok = results.filter((r) => r.status === 200).length;
    const rejected = results.filter((r) => r.status === 429).length;

    console.log('Burst load results', results.map((r) => ({ i: r.i, status: r.status, durationMs: r.durationMs })));

    expect(ok).toBe(capacity);
    expect(rejected).toBe(reqCount - capacity);
  });
});

