import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';

export function createUserRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  // GET /api/user/role?group_id=X — returns isAdmin flag for current user.
  // Deliberately open to non-members: they simply get isAdmin: false.
  router.get('/role', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const user = currentUser(req);
      const isAdmin = await groupService.isUserAdmin(user.id, groupId);
      res.json({ isAdmin, userId: user.id });
    } catch (error) {
      console.error('Error fetching user role:', error);
      res.status(500).json({ error: 'Failed to fetch user role' });
    }
  });

  // GET /api/user/members?group_id=X — returns group members list (admin only)
  router.get('/members', async (req: AuthRequest, res: Response): Promise<void> => {
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId) {
      res.status(400).json({ error: 'group_id is required' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
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
  router.patch('/:id/name', async (req: AuthRequest, res: Response): Promise<void> => {
    const targetUserId = parseInt(req.params.id);
    const groupId = parseInt(req.query.group_id as string);
    const { first_name, last_name } = req.body ?? {};

    if (!groupId || !targetUserId) {
      res.status(400).json({ error: 'group_id and user id are required' });
      return;
    }

    if (!first_name || typeof first_name !== 'string' || !first_name.trim()) {
      res.status(400).json({ error: 'first_name is required' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      // An admin may only rename people of their own group, not any user in the system
      if (!(await groupService.isUserMember(targetUserId, groupId))) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }

      // Empty string clears last_name; absent leaves it untouched
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

  // DELETE /api/user/:id/member?group_id=X — remove (soft-delete) a member from the group (admin only)
  router.delete('/:id/member', async (req: AuthRequest, res: Response): Promise<void> => {
    const targetUserId = parseInt(req.params.id);
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId || !targetUserId) {
      res.status(400).json({ error: 'group_id and user id are required' });
      return;
    }

    try {
      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      if (!(await groupService.isUserMember(targetUserId, groupId))) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }

      // Removing an admin (including oneself) could leave the group with nobody able to manage it
      if (await groupService.isUserAdmin(targetUserId, groupId)) {
        res.status(400).json({ error: 'Cannot remove an admin' });
        return;
      }

      await groupService.removeMemberFromGroup(targetUserId, groupId);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error removing member:', error);
      res.status(500).json({ error: 'Failed to remove member' });
    }
  });

  return router;
}
