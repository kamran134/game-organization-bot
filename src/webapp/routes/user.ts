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

  // GET /api/user/members?group_id=X — returns group members list (admin only)
  router.get('/members', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const requester = await userService.findOrCreateUser({
        id: telegramUser!.id,
        username: telegramUser!.username,
        first_name: telegramUser!.first_name,
        last_name: telegramUser!.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(requester.id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      const members = await groupService.getGroupMembers(groupId);
      res.json(members.map(m => ({
        id: m.user.id,
        first_name: m.user.first_name,
        last_name: m.user.last_name,
        username: m.user.username,
      })));
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  // PATCH /api/user/:id/name?group_id=X — update user name (admin only)
  router.patch('/:id/name', verifyTelegramInitData, async (req: AuthRequest, res: Response): Promise<void> => {
    const telegramUser = req.telegramUser;
    const targetUserId = parseInt(req.params.id);
    const groupId = parseInt(req.query.group_id as string);
    const { first_name, last_name } = req.body;

    if (!groupId || !targetUserId) {
      res.status(400).json({ error: 'group_id and user id are required' });
      return;
    }

    if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
      res.status(400).json({ error: 'first_name is required' });
      return;
    }

    try {
      const requester = await userService.findOrCreateUser({
        id: telegramUser!.id,
        username: telegramUser!.username,
        first_name: telegramUser!.first_name,
        last_name: telegramUser!.last_name,
      });

      const isAdmin = await groupService.isUserAdmin(requester.id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      await userService.updateUserName(
        targetUserId,
        first_name.trim(),
        typeof last_name === 'string' ? last_name.trim() : undefined,
      );

      res.json({ ok: true });
    } catch (error) {
      console.error('Error updating user name:', error);
      res.status(500).json({ error: 'Failed to update name' });
    }
  });

  return router;
}
