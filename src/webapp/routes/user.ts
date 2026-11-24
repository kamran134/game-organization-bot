import { Router, Response } from 'express';
import { AuthRequest } from '../types/express';
import { Database } from '../../database/Database';
import { UserService } from '../../services/UserService';
import { GroupService } from '../../services/GroupService';
import { verifyTelegramInitData } from '../middleware/telegramAuth';
import { requireUser, currentUser } from '../middleware/requireUser';
import { parseFirstNameField, parseGenderField, parseLastNameField } from '../userBodyValidator';
import { ValidationError } from '../../utils/errors';
import { User } from '../../models/User';

export function createUserRouter(db: Database): Router {
  const router = Router();
  const userService = new UserService(db);
  const groupService = new GroupService(db);

  router.use(verifyTelegramInitData, requireUser(userService));

  /** Profile fields the web app reads; `phone` and `telegram_id` stay on the server. */
  function serializeProfile(user: User): Record<string, unknown> {
    return {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username ?? null,
      gender: user.gender ?? null,
    };
  }

  /** 400 with the message for a rejected body, 500 (logged) for anything else. */
  function fail(res: Response, error: unknown, label: string): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(`${label}:`, error);
    res.status(500).json({ error: label });
  }

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
      res.json(members.map(m => serializeProfile(m.user)));
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  // GET /api/user/me — the caller's own profile (any logged-in user)
  router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      res.json(serializeProfile(currentUser(req)));
    } catch (error) {
      fail(res, error, 'Failed to fetch profile');
    }
  });

  // PATCH /api/user/me — the caller changes their own gender and nothing else
  router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const gender = parseGenderField(req.body?.gender);
      if (gender === undefined) {
        res.status(400).json({ error: 'gender is required' });
        return;
      }

      const user = currentUser(req);
      await userService.updateUserGender(user.id, gender);
      user.gender = gender;

      res.json(serializeProfile(user));
    } catch (error) {
      fail(res, error, 'Failed to update profile');
    }
  });

  // PATCH /api/user/:id/profile?group_id=X — update a member's name and gender (admin only)
  router.patch('/:id/profile', async (req: AuthRequest, res: Response): Promise<void> => {
    const targetUserId = parseInt(req.params.id);
    const groupId = parseInt(req.query.group_id as string);

    if (!groupId || !targetUserId) {
      res.status(400).json({ error: 'group_id and user id are required' });
      return;
    }

    try {
      const body = req.body ?? {};
      // Empty string clears last_name; an absent field leaves it untouched
      const patch = {
        first_name: parseFirstNameField(body.first_name),
        last_name: parseLastNameField(body.last_name),
        gender: parseGenderField(body.gender),
      };

      const isAdmin = await groupService.isUserAdmin(currentUser(req).id, groupId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin only' });
        return;
      }

      // An admin may only edit people of their own group, not any user in the system
      if (!(await groupService.isUserMember(targetUserId, groupId))) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }

      await userService.updateUserProfile(targetUserId, patch);

      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'Failed to update profile');
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
