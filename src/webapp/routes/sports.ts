import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { SportService } from '../../services/SportService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { GroupAccessChecker } from '../access';
import { ValidationError } from '../../utils/errors';

export function createSportsRouter(db: Database, canAccessGroup: GroupAccessChecker): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);
  const sportService = new SportService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  // GET /api/sports?group_id=X - list sports visible to a group (base + group's own)
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

      const sports = await sportService.getSportsForGroup(groupId);
      res.json(sports.map(sport => ({
        id: sport.id,
        name: sport.name,
        emoji: sport.emoji,
        is_base: sport.group_id === null || sport.group_id === undefined,
      })));
    } catch (error) {
      console.error('Error fetching sports:', error);
      res.status(500).json({ error: 'Failed to fetch sports' });
    }
  });

  // POST /api/sports?group_id=X - create a group sport (admin only)
  router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);
    const { name, emoji } = req.body;

    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }
    if (!name || typeof name !== 'string' || !emoji || typeof emoji !== 'string') {
      res.status(400).json({ error: 'name and emoji are required' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      const sport = await sportService.createGroupSport(groupId, name, emoji);
      res.status(201).json({
        id: sport.id,
        name: sport.name,
        emoji: sport.emoji,
        is_base: false,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error creating sport:', error);
      res.status(500).json({ error: 'Failed to create sport' });
    }
  });

  // DELETE /api/sports/:id?group_id=X - deactivate a group sport (admin only)
  router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
    const sportId = parseInt(req.params.id);
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId || !sportId) {
      res.status(400).json({ error: 'group_id and sport id are required' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      await sportService.deactivateGroupSport(sportId, groupId);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Error deleting sport:', error);
      res.status(500).json({ error: 'Failed to delete sport' });
    }
  });

  return router;
}
