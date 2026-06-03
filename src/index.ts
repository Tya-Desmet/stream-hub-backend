import express from 'express';
import cors from 'cors';
import { config, corsOriginOption } from './config';
import { authRouter } from './auth';
import { contentRouter } from './routes/content';

const app = express();

app.use(cors({ origin: corsOriginOption() }));
app.use(express.json({ limit: '1mb' }));

// Monitoring
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'stream-hub-backend' });
});

// B02 — Auth admin : POST /api/admin/login
app.use('/api/admin', authRouter);

// B03 — Contenu éditorial : GET /api/content[/:kind] (public) + POST /api/admin/content/:kind (auth)
app.use('/api', contentRouter);

// Routers montés dans les lots suivants :
//   B06 : /api/push, /api/leaderboard, /api/users/:id

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] écoute sur http://localhost:${config.port}`);
});
