import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDatabase } from './db.ts';
import { createAuthRouter } from './routes/auth.ts';
import { createProfileRouter } from './routes/profiles.ts';

const app = express();
const port = Number(process.env.PORT ?? 5173);
const database = createDatabase();
await database.query('SELECT 1');

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
app.use('/api/auth', createAuthRouter({ database }));
app.use('/api', createProfileRouter(database));
app.use('/api', (_request, response) => response.status(404).json({ error: 'This endpoint is not available.' }));

if (process.env.NODE_ENV === 'production') {
  const distPath = resolve('dist');
  if (!existsSync(distPath)) throw new Error('Production build not found. Run npm run build first.');
  app.use(express.static(distPath));
  app.get('*splat', (_request, response) => response.sendFile(resolve(distPath, 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Geemifi is running at http://localhost:${port}`);
});