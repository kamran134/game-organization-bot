import { Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { AuthRequest } from '../types/express';

/** Maximum age (in seconds) of Telegram initData before it's considered stale. */
const MAX_AUTH_AGE_SECONDS = 86400; // 24 hours

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

  // In development mode, allow skipping verification only when explicitly opted-in
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_TELEGRAM_AUTH === 'true' && !initData) {
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

    if (!crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(hash, 'hex'))) {
      res.status(401).json({ error: 'Invalid init data' });
      return;
    }

    // Verify auth_date is not too old
    const authDate = params.get('auth_date');
    if (authDate) {
      const authTimestamp = parseInt(authDate, 10);
      const now = Math.floor(Date.now() / 1000);
      if (isNaN(authTimestamp) || now - authTimestamp > MAX_AUTH_AGE_SECONDS) {
        res.status(401).json({ error: 'Init data expired' });
        return;
      }
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
