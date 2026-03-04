import express from 'express';
import cors from 'cors';
import path from 'path';
import { Database } from '../database/Database';
import { createGamesRouter } from './routes/games';
import { createSportsRouter } from './routes/sports';
import { createLocationsRouter } from './routes/locations';

export function createWebAppServer(db: Database) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files from /public
  const publicDir = path.join(__dirname, '../../public');
  app.use(express.static(publicDir));

  // API routes
  app.use('/api/games', createGamesRouter(db));
  app.use('/api/sports', createSportsRouter(db));
  app.use('/api/locations', createLocationsRouter(db));

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
