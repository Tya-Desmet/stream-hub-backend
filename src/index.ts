import path from 'path';
import express from 'express';
import cors from 'cors';
import { config, corsOriginOption } from './config';
import { authRouter } from './auth';
import { contentRouter } from './routes/content';
import { pushRouter } from './routes/push';
import { uploadRouter } from './routes/upload';

const app = express();

// Durcissement : ne pas révéler le framework
app.disable('x-powered-by');

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

// B06 — Temps réel : POST /api/push (clé) + GET /api/leaderboard + GET /api/users/:id
app.use('/api', pushRouter);

// Upload de fichiers téléchargeables : POST /api/admin/upload (auth)
app.use('/api', uploadRouter);

// Service des fichiers déposés, forcés en téléchargement.
app.use(
  '/files',
  express.static(path.resolve(config.uploadsDir), {
    setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment'),
  }),
);

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] écoute sur http://localhost:${config.port}`);
});
