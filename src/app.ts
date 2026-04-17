import express from 'express';
import type { Application } from 'express';
import apiRouter from './routes/api';
import adminRouter from './routes/admin';
import { config } from './config/config';
import { createRateLimiter } from './middleware/rateLimiter';
import type { RateLimiterOptions } from './types';

export function createApp(
  overrides?: { rateLimiterOptions?: RateLimiterOptions }
): Application {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const rateLimiterOptions: RateLimiterOptions = overrides?.rateLimiterOptions ?? {
    capacity: config.rateLimit.capacity,
    refillRate: config.rateLimit.refillRate
  };

  app.use('/api', createRateLimiter(rateLimiterOptions), apiRouter);
  app.use('/admin', adminRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
  return app;
}

if (require.main === module) {
  const port = config.port;
  const app = createApp();
  app.listen(port, () => {
    console.log(`rate-limiter-service listening on port ${port}`);
  });
}

