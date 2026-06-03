import { Router, type Request, type Response } from 'express';
import { read, write } from '../store';
import { requireAuth } from '../auth';

// Contenu éditorial servi/persisté. Forme = identique aux content/*.json du site.
const KINDS = ['friends', 'schedule', 'resources', 'site'] as const;
type Kind = (typeof KINDS)[number];

const FILE: Record<Kind, string> = {
  friends: 'friends.json',
  schedule: 'schedule.json',
  resources: 'resources.json',
  site: 'site.json',
};

const FALLBACK: Record<Kind, unknown> = {
  friends: [],
  schedule: { days: [] },
  resources: [],
  site: { theme: 'shibuya', twitchChannel: '' },
};

function isKind(k: string): k is Kind {
  return (KINDS as readonly string[]).includes(k);
}

// Validation de forme basique avant écriture.
function validate(kind: Kind, body: unknown): string | null {
  if (kind === 'friends' || kind === 'resources') {
    if (!Array.isArray(body)) return 'Format attendu : tableau JSON.';
  } else if (kind === 'schedule') {
    const b = body as { days?: unknown };
    if (typeof body !== 'object' || body === null || !Array.isArray(b.days)) {
      return 'Format attendu : { days: [...] }.';
    }
  } else if (kind === 'site') {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return 'Format attendu : objet.';
    }
  }
  return null;
}

export const contentRouter = Router();

// GET /api/content → tout le contenu éditorial
contentRouter.get('/content', (_req: Request, res: Response) => {
  const out: Record<string, unknown> = {};
  for (const k of KINDS) out[k] = read(FILE[k], FALLBACK[k]);
  res.json(out);
});

// GET /api/content/:kind
contentRouter.get('/content/:kind', (req: Request, res: Response) => {
  const kind = req.params.kind;
  if (!isKind(kind)) return res.status(400).json({ error: 'Type de contenu inconnu.' });
  return res.json(read(FILE[kind], FALLBACK[kind]));
});

// POST /api/admin/content/:kind (auth) → remplace le contenu après validation
contentRouter.post('/admin/content/:kind', requireAuth, (req: Request, res: Response) => {
  const kind = req.params.kind;
  if (!isKind(kind)) return res.status(400).json({ error: 'Type de contenu inconnu.' });
  const err = validate(kind, req.body);
  if (err) return res.status(400).json({ error: err });
  write(FILE[kind], req.body);
  return res.json(req.body);
});
