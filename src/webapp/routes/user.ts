import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';

export function createUserRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);

  // GET /api/user/role?group_id=X — returns isAdmin flag for current user
  router.get('/role', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const user = await userService.findOrCreateUser({
        id: telegramUser!.id,
        username: telegramUser!.username,
        first_name: telegramUser!.first_name,
        last_name: telegramUser!.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(user.id, groupId);
      res.json({ isAdmin, userId: user.id });
    } catch (error) {
      console.error('Error fetching user role:', error);
      res.status(500).json({ error: 'Failed to fetch user role' });
    }
  });

  return router;
}
