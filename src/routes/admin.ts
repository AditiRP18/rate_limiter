import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ClientStats } from '../types';
import {
  getClientStats,
  listActiveClientStats,
  resetClientBucket
} from '../services/redisService';
import { logger } from '../utils/logger';

const router = Router();

router.get('/stats/:clientId', async (req: Request, res: Response): Promise<void> => {
  const clientId = req.params.clientId;
  try {
    const stats: ClientStats = await getClientStats(clientId);
    res.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin stats failed', { error: message });
    res.status(500).json({ error: 'Failed to fetch client stats' });
  }
});

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const clients = await listActiveClientStats();
    res.json({ clients, count: clients.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin stats list failed', { error: message });
    res.status(500).json({ error: 'Failed to list client stats' });
  }
});

router.delete('/reset/:clientId', async (req: Request, res: Response): Promise<void> => {
  const clientId = req.params.clientId;
  try {
    const deleted = await resetClientBucket(clientId);
    res.json({ clientId, deleted: deleted > 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Admin reset failed', { error: message });
    res.status(500).json({ error: 'Failed to reset client bucket' });
  }
});

export default router;

