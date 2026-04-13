import { Router, Request, Response } from 'express';
import { Database } from '../../database/Database';
import { Location } from '../../models/Location';
import { verifyTelegramInitData } from '../middleware/telegramAuth';

export function createLocationsRouter(db: Database): Router {
  const router = Router();

  // GET /api/locations?group_id=X - list active locations for a group
  router.get('/', verifyTelegramInitData, async (req: Request, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);
    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const locationRepo = db.getRepository(Location);
      const locations = await locationRepo.find({
        where: { group_id: groupId, is_active: true },
        order: { name: 'ASC' },
      });
      res.json(locations);
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  return router;
}
