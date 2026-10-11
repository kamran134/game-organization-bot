import express from 'express';
import cors from 'cors';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { Telegram } from 'telegraf';
import { Database } from '../database/Database';
import { GroupService } from '../services/GroupService';
import { JokeService } from '../services/JokeService';
import { NotificationService } from '../services/NotificationService';
import { createGroupAccessChecker } from './access';
import { createGamesRouter } from './routes/games';
import { createSportsRouter } from './routes/sports';
import { createLocationsRouter } from './routes/locations';
import { createUserRouter } from './routes/user';
import { createPaymentsRouter } from './routes/payments';

/** Origins allowed to call the API. */
const ALLOWED_ORIGINS = [
  'https://web.telegram.org',
  'https://webk.telegram.org',
  'https://webz.telegram.org',
  // Own webapp domain — Telegram WebView sends Origin even for same-origin requests.
  // Read from env so no code change is needed per environment.
  process.env.WEBAPP_URL,
].filter(Boolean) as string[];

// ── Simple in-memory rate limiter ────────────────────────────────────────────
interface RateLimitEntry { count: number; resetAt: number }
const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60;           // requests per window per IP

function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // req.ip honours X-Forwarded-For only from the trusted proxy (see 'trust proxy' below),
  // so a client cannot dodge the limit by spoofing the header.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests, please slow down.' });
    return;
  }
  next();
}

// Periodically clean up expired entries to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rejects cross-origin API calls from origins outside the allow-list with a plain 403.
 * Requests with no Origin (Telegram mobile/desktop WebView) pass; development allows everything.
 */
function originGuard(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV === 'development') {
    next();
    return;
  }
  res.status(403).json({ error: 'Origin not allowed' });
}

export function createWebAppServer(db: Database) {
  const app = express();

  // The container port is bound to localhost behind exactly one reverse proxy
  app.set('trust proxy', 1);

  // Auth is header-based (initData), so no cookies/credentials are involved
  app.use('/api', originGuard, cors({ origin: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply rate limiting to all API routes
  app.use('/api', rateLimiter);

  // One Telegram client for all routers (membership lookups + group notifications)
  const telegram = new Telegram(process.env.BOT_TOKEN ?? '');
  const groupService = new GroupService(db);
  const canAccessGroup = createGroupAccessChecker(groupService, telegram);
  const notificationService = new NotificationService(telegram, groupService, new JokeService());

  // Serve static files from /public
  const publicDir = path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  // API routes
  app.use('/api/games', createGamesRouter(db, notificationService, canAccessGroup));
  app.use('/api/sports', createSportsRouter(db, canAccessGroup));
  app.use('/api/locations', createLocationsRouter(db, canAccessGroup));
  app.use('/api/user', createUserRouter(db));
  app.use('/api/payments', createPaymentsRouter(db));

  // Unknown API paths must not fall through to the SPA's index.html
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Health check
  // Docker's HEALTHCHECK hits this; a lost DB connection must turn the container unhealthy.
  app.get('/health', async (_req, res) => {
    try {
      await db.dataSource.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  // Fallback to index.html (SPA)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Final error handler: JSON only, no stack traces or internal messages
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    console.error('Unhandled WebApp error:', err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}

export function startWebAppServer(db: Database): import('http').Server {
  const port = parseInt(process.env.WEBAPP_PORT || '3000', 10);
  const app = createWebAppServer(db);

  const server = app.listen(port, () => {
    console.log(`✅ WebApp server running on http://localhost:${port}`);
  });

  return server;
}
