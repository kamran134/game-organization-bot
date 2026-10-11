import { Router, Response } from 'express';
import { Database } from '../../database/Database';
import { Location } from '../../models/Location';
import { LocationService } from '../../services/LocationService';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { SportService } from '../../services/SportService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import { serializeLocation } from '../serializers';
import { AuthRequest } from '../types/express';

// locations.name is VARCHAR(255), locations.map_url is VARCHAR(500)
const MAX_NAME_LENGTH = 255;
const MAX_MAP_URL_LENGTH = 500;

export function createLocationsRouter(db: Database, canAccessGroup: GroupAccessChecker): Router {
  const router = Router();
  const locationService = new LocationService(db);
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const sportService = new SportService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  // GET /api/locations?group_id=X - list active locations for a group
  router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);
    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      if (!(await canAccessGroup(currentUser(req), groupId))) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const locationRepo = db.getRepository(Location);
      const locations = await locationRepo.find({
        where: { group_id: groupId, is_active: true },
        order: { name: 'ASC' },
      });
      res.json(locations.map(serializeLocation));
    } catch (error) {
      console.error('Error fetching locations:', error);
      res.status(500).json({ error: 'Failed to fetch locations' });
    }
  });

  // POST /api/locations - create a new location (admin only)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const { group_id, name, sport_ids, map_url } = req.body ?? {};

    if (!group_id || !name) {
      res.status(400).json({ error: 'group_id and name are required' });
      return;
    }

    const parsedGroupId = parseInt(group_id);
    if (isNaN(parsedGroupId)) {
      res.status(400).json({ error: 'Invalid group_id' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, parsedGroupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Only group admins can create locations' });
        return;
      }

      const trimmedName = String(name).trim();
      if (!trimmedName) {
        res.status(400).json({ error: 'Name cannot be empty' });
        return;
      }
      if (trimmedName.length > MAX_NAME_LENGTH) {
        res.status(400).json({ error: `Name is too long (max ${MAX_NAME_LENGTH})` });
        return;
      }
      const trimmedMapUrl = map_url ? String(map_url).trim() : undefined;
      if (trimmedMapUrl && trimmedMapUrl.length > MAX_MAP_URL_LENGTH) {
        res.status(400).json({ error: `map_url is too long (max ${MAX_MAP_URL_LENGTH})` });
        return;
      }

      const parsedSportIds: number[] = Array.isArray(sport_ids)
        ? [...new Set(sport_ids.map(Number))]
        : [];
      if (parsedSportIds.some((id) => !Number.isInteger(id) || id < 1)) {
        res.status(400).json({ error: 'Invalid sport_ids' });
        return;
      }

      // Every sport must be a base sport or belong to this group
      const availableSportIds = new Set(
        (await sportService.getSportsForGroup(parsedGroupId)).map((sport) => sport.id),
      );
      if (parsedSportIds.some((id) => !availableSportIds.has(id))) {
        res.status(400).json({ error: 'Sport is not available for this group' });
        return;
      }

      const location = await locationService.create({
        name: trimmedName,
        group_id: parsedGroupId,
        sport_ids: parsedSportIds,
        map_url: trimmedMapUrl,
      });

      res.status(201).json(serializeLocation(location));
    } catch (error) {
      console.error('Error creating location:', error);
      res.status(500).json({ error: 'Failed to create location' });
    }
  });

  return router;
}
