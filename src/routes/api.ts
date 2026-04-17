import { Router } from 'express';
import type { Request, Response } from 'express';
import type { RequestWithClientId } from '../types';

const router = Router();

router.get('/hello', (req: Request, res: Response) => {
  const reqWithClient = req as RequestWithClientId;
  const timestamp = new Date().toISOString();
  res.json({
    message: 'Hello!',
    clientId: reqWithClient.clientId,
    timestamp
  });
});

router.get('/data', (_req: Request, res: Response) => {
  const data = [
    { id: 1, name: 'alpha' },
    { id: 2, name: 'beta' },
    { id: 3, name: 'gamma' }
  ];
  res.json({ data });
});

router.post('/submit', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { [key: string]: unknown };
  res.json({ received: true, bodyKeys: Object.keys(body) });
});

export default router;

