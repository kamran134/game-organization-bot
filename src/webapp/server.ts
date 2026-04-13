import express from 'express';
import cors from 'cors';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { Database } from '../database/Database';
import { createGamesRouter } from './routes/games';
import { createSportsRouter } from './routes/sports';
import { createLocationsRouter } from './routes/locations';
import { createUserRouter } from './routes/user';

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
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
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
}, RATE_LIMIT_WINDOW_MS);
// ─────────────────────────────────────────────────────────────────────────────

export function createWebAppServer(db: Database) {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests with no origin (Telegram mobile/desktop WebView)
        // and explicitly whitelisted origins.
        // In development, allow everything for convenience.
        if (
          !origin ||
          ALLOWED_ORIGINS.includes(origin) ||
          process.env.NODE_ENV === 'development'
        ) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply rate limiting to all API routes
  app.use('/api', rateLimiter);

  // Serve static files from /public
  const publicDir = path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  // API routes
  app.use('/api/games', createGamesRouter(db));
  app.use('/api/sports', createSportsRouter(db));
  app.use('/api/locations', createLocationsRouter(db));
  app.use('/api/user', createUserRouter(db));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Fallback to index.html (SPA)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
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
