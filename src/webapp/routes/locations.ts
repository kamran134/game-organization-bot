import { Router, Request, Response } from 'express';
import { Database } from '../../database/Database';
import { Location } from '../../models/Location';
import { LocationService } from '../../services/LocationService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { AuthRequest } from '../types/express';

export function createLocationsRouter(db: Database): Router {
  const router = Router();
  const locationService = new LocationService(db);
  const userService = new UserService(db);
  const groupService = new GroupService(db);

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

  // POST /api/locations - create a new location (admin only)
  router.post('/', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const { group_id, name, sport_ids, map_url } = req.body;

    if (!telegramUser || !group_id || !name) {
      res.status(400).json({ error: 'group_id and name are required' });
      return;
    }

    const parsedGroupId = parseInt(group_id);
    if (isNaN(parsedGroupId)) {
      res.status(400).json({ error: 'Invalid group_id' });
      return;
    }

    try {
      const user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(user.id, parsedGroupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can create locations' });
        return;
      }

      const trimmedName = String(name).trim();
      if (!trimmedName) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }

      const parsedSportIds: number[] = Array.isArray(sport_ids)
        ? sport_ids.map(Number).filter((n: number) => !isNaN(n))
        : [];

      const location = await locationService.create({
        name: trimmedName,
        group_id: parsedGroupId,
        sport_ids: parsedSportIds,
        map_url: map_url ? String(map_url).trim() : undefined,
      });

      res.status(201).json(location);
    } catch (error) {
      console.error('Error creating location:', error);
      res.status(500).json({ error: 'Failed to create location' });
    }
  });

  return router;
}
