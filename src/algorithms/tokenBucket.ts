import type Redis from 'ioredis';
import type { ConsumeResult } from '../types';
import { getRateLimitKey } from '../services/redisService';

type ConsumeTokensCommand = (
  key: string,
  capacity: number,
  refillRate: number,
  nowMs: number
) => Promise<[string | number, string | number, string | number]>;

export class TokenBucket {
  constructor(private readonly redis: Redis) {}

  async consume(
    clientId: string,
    capacity: number,
    refillRate: number
  ): Promise<ConsumeResult> {
    const key = getRateLimitKey(clientId);
    const nowMs = Date.now();

    const redisWithCommand = this.redis as unknown as {
      consumeTokens: ConsumeTokensCommand;
    };

    const [allowedRaw, remainingRaw, resetMsRaw] = await redisWithCommand.consumeTokens(
      key,
      capacity,
      refillRate,
      nowMs
    );

    const allowed = Number(allowedRaw) === 1;
    const remainingTokens = Number(remainingRaw);
    const resetMs = Number(resetMsRaw);

    return {
      allowed,
      remainingTokens: Number.isFinite(remainingTokens) ? remainingTokens : 0,
      resetMs: Number.isFinite(resetMs) ? resetMs : nowMs
    };
  }
}

