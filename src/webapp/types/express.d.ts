import { Request } from 'express';
import type { User } from '../../models/User';

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

// Extend Express Request to carry verified Telegram user and the resolved DB user
declare module 'express-serve-static-core' {
  interface Request {
    telegramUser?: TelegramUser;
    /** Set by requireUser — the DB entity for telegramUser. */
    user?: User;
  }
}

export type AuthRequest = Request;
