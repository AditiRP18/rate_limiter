import type { Request } from 'express';

export interface RateLimiterOptions {
  capacity: number; // max tokens in bucket
  refillRate: number; // tokens added per second
  clientIdExtractor?: (req: Request) => string; // default: req.ip
}

export interface ConsumeResult {
  allowed: boolean;
  remainingTokens: number;
  resetMs: number;
}

export interface ClientStats {
  clientId: string;
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

export interface RequestWithClientId extends Request {
  clientId: string;
}

