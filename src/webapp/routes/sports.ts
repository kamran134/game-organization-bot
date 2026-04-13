import { Router, Request, Response } from 'express';
import { Database } from '../../database/Database';
import { Sport } from '../../models/Sport';
import { verifyTelegramInitData } from '../middleware/telegramAuth';

export function createSportsRouter(db: Database): Router {
  const router = Router();

  // GET /api/sports - list all sports
  router.get('/', verifyTelegramInitData, async (_req: Request, res: Response): Promise<void> => {
    try {
      const sportRepo = db.getRepository(Sport);
      const sports = await sportRepo.find({ order: { name: 'ASC' } });
      res.json(sports);
    } catch (error) {
      console.error('Error fetching sports:', error);
      res.status(500).json({ error: 'Failed to fetch sports' });
    }
  });

  return router;
}
