import { Router, type Request, type Response } from 'express';
import { read, write } from '../store';
import { config } from '../config';

// Données temps réel poussées par le bot (XP/leaderboard/profils).
// Le backend ne calcule rien : il stocke et sert les valeurs déjà calculées (contrat V3).
export const pushRouter = Router();

function keyOk(req: Request): boolean {
  const key = req.header('X-Api-Key') || '';
  return !!config.pushApiKey && key === config.pushApiKey;
}

// Anti path-traversal : login Twitch = lettres/chiffres/_ uniquement.
function safeName(s: unknown): string | null {
  return typeof s === 'string' && /^[a-zA-Z0-9_]{1,40}$/.test(s) ? s.toLowerCase() : null;
}

// POST /api/push  { meta?, leaderboard?, users?: PublicProfile[] }  (X-Api-Key requis)
pushRouter.post('/push', (req: Request, res: Response) => {
  if (!keyOk(req)) return res.status(401).json({ error: 'Clé API invalide.' });
  const body = (req.body ?? {}) as { meta?: unknown; leaderboard?: unknown; users?: unknown };

  if (body.meta) write('live/meta.json', body.meta);
  if (body.leaderboard) write('live/leaderboard.json', body.leaderboard);

  let savedUsers = 0;
  if (Array.isArray(body.users)) {
    for (const u of body.users) {
      const name = safeName((u as { username?: unknown })?.username);
      if (name) {
        write(`live/users/${name}.json`, u);
        savedUsers++;
      }
    }
  }
  return res.json({ ok: true, users: savedUsers });
});

// GET /api/leaderboard → dernier snapshot poussé
pushRouter.get('/leaderboard', (_req: Request, res: Response) => {
  res.json(read('live/leaderboard.json', { generatedAt: 0, season: 'all-time', players: [] }));
});

// GET /api/users/:id → profil temps réel
pushRouter.get('/users/:id', (req: Request, res: Response) => {
  const name = safeName(req.params.id);
  if (!name) return res.status(400).json({ error: 'Identifiant invalide.' });
  const profile = read<unknown | null>(`live/users/${name}.json`, null);
  if (!profile) return res.status(404).json({ error: 'Profil introuvable.' });
  return res.json(profile);
});
