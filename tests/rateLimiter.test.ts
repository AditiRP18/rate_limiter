import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app';
import {
  pingRedis,
  resetClientBucket,
  shutdownRedis
} from '../src/services/redisService';

const capacity = 10;
const refillRate = 2;

function makeApp(): Express.Application {
  return createApp({
    rateLimiterOptions: {
      capacity,
      refillRate,
      clientIdExtractor: (req) =>
        (req.headers['x-client-id'] as string | undefined) ??
        req.ip ??
        req.socket.remoteAddress ??
        'unknown'
    }
  });
}

describe('RateLimiter Token Bucket', () => {
  const app = makeApp() as unknown as Parameters<typeof request>[0];
  let redisAvailable = false;

  beforeAll(async () => {
    redisAvailable = await pingRedis(2000);
    if (!redisAvailable) {
      await shutdownRedis();
    }
  });

  beforeEach(async () => {
    if (!redisAvailable) return;
    await resetClientBucket('client-A');
    await resetClientBucket('client-B');
  });

  afterAll(async () => {
    await shutdownRedis();
  });

  test('allows requests under the limit', async () => {
    if (!redisAvailable) return;
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .get('/api/hello')
        .set('x-client-id', 'client-A');
      expect(res.status).toBe(200);
    }
  });

  test('blocks requests over the limit', async () => {
    if (!redisAvailable) return;
    for (let i = 0; i < capacity; i += 1) {
      const res = await request(app)
        .get('/api/hello')
        .set('x-client-id', 'client-A');
      expect(res.status).toBe(200);
    }

    const rejected = await request(app)
      .get('/api/hello')
      .set('x-client-id', 'client-A');
    expect(rejected.status).toBe(429);
    expect(rejected.body).toEqual({
      error: 'Too Many Requests',
      retryAfter: Number(rejected.headers['retry-after'])
    });
  });

  test('includes correct rate limit headers', async () => {
    if (!redisAvailable) return;
    const res = await request(app)
      .get('/api/hello')
      .set('x-client-id', 'client-A');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe(capacity.toString());

    const remaining = Number(res.headers['x-ratelimit-remaining']);
    expect(remaining).toBeCloseTo(capacity - 1, 3);

    const resetMs = Number(res.headers['x-ratelimit-reset']);
    const now = Date.now();
    expect(resetMs).toBeGreaterThan(now);
    expect(resetMs).toBeLessThan(now + 20000);
  });

  test('uses independent buckets per clientId', async () => {
    if (!redisAvailable) return;
    for (let i = 0; i < capacity; i += 1) {
      const res = await request(app)
        .get('/api/hello')
        .set('x-client-id', 'client-A');
      expect(res.status).toBe(200);
    }

    const resB = await request(app)
      .get('/api/hello')
      .set('x-client-id', 'client-B');
    expect(resB.status).toBe(200);
  });

  test('refills tokens over time', async () => {
    if (!redisAvailable) return;
    for (let i = 0; i < capacity; i += 1) {
      const res = await request(app)
        .get('/api/hello')
        .set('x-client-id', 'client-A');
      expect(res.status).toBe(200);
    }

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await request(app)
      .get('/api/hello')
      .set('x-client-id', 'client-A');
    expect(res.status).toBe(200);
  });
});

