import express from 'express';
import cors from 'cors';
import path from 'path';
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
];

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

export function startWebAppServer(db: Database): void {
  const port = parseInt(process.env.WEBAPP_PORT || '3000', 10);
  const app = createWebAppServer(db);

  app.listen(port, () => {
    console.log(`✅ WebApp server running on http://localhost:${port}`);
  });
}
