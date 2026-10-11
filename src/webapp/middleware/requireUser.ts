import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/express';
import { UserService } from '../../services/UserService';
import { User } from '../../models/User';

/**
 * Resolves the DB user for the verified Telegram user and attaches it as `req.user`.
 * Must run after verifyTelegramInitData.
 */
export function requireUser(userService: UserService) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const telegramUser = req.telegramUser;
    if (!telegramUser) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      req.user = await userService.findOrCreateUser({
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
      });
      next();
    } catch (error) {
      console.error('Failed to resolve user:', error);
      res.status(500).json({ error: 'Failed to resolve user' });
    }
  };
}

/** Returns the user attached by requireUser; throws if the middleware was not mounted. */
export function currentUser(req: AuthRequest): User {
  if (!req.user) {
    throw new Error('requireUser middleware is not mounted on this route');
  }
  return req.user;
}
