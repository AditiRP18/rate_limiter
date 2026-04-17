import type { RequestHandler } from 'express';
import type { Request } from 'express';
import { TokenBucket } from '../algorithms/tokenBucket';
import { getRedisClient } from '../services/redisService';
import type { RateLimiterOptions, RequestWithClientId } from '../types';
import { logger } from '../utils/logger';

function getDefaultClientId(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const tokenBucket = new TokenBucket(getRedisClient());

  const clientIdExtractor = options.clientIdExtractor ?? getDefaultClientId;

  return async (req, res, next): Promise<void> => {
    const clientId = clientIdExtractor(req);
    const reqWithClient = req as RequestWithClientId;
    reqWithClient.clientId = clientId;

    try {
      const { allowed, remainingTokens, resetMs } = await tokenBucket.consume(
        clientId,
        options.capacity,
        options.refillRate
      );

      res.setHeader('X-RateLimit-Limit', options.capacity.toString());
      res.setHeader('X-RateLimit-Remaining', remainingTokens.toString());
      res.setHeader('X-RateLimit-Reset', resetMs.toString());

      if (allowed) {
        return next();
      }

      const nowMs = Date.now();
      const retryAfterSeconds = Math.ceil(
        Math.max(0, resetMs - nowMs) / 1000
      );

      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: retryAfterSeconds
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Rate limiter failure', { error: message });
      res.status(503).json({ error: 'Rate limiter temporarily unavailable' });
    }
  };
}

