import { Request } from 'express';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

// Extend Express Request to carry verified Telegram user
declare module 'express-serve-static-core' {
  interface Request {
    telegramUser?: TelegramUser;
  }
}

export type AuthRequest = Request;
