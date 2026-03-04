import { Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { AuthRequest } from '../types/express';

// Verifies Telegram WebApp initData and attaches user to request
export function verifyTelegramInitData(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const initData = req.headers['x-telegram-init-data'] as string;

  // In development mode, allow skipping verification
  if (process.env.NODE_ENV === 'development' && !initData) {
    req.telegramUser = { id: 0, first_name: 'Dev', username: 'dev' };
    next();
    return;
  }

  if (!initData) {
    res.status(401).json({ error: 'Missing Telegram init data' });
    return;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      res.status(401).json({ error: 'Missing hash' });
      return;
    }

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      res.status(401).json({ error: 'Invalid init data' });
      return;
    }

    const userParam = params.get('user');
    if (userParam) {
      req.telegramUser = JSON.parse(userParam) as import('../types/express').TelegramUser;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Failed to verify init data' });
  }
}
