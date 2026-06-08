import { Router, type Request, type Response } from 'express';
import { read, write } from '../store';
import { requireRole } from '../auth';

// Contenu éditorial servi/persisté. Forme = identique aux content/*.json du site.
const KINDS = ['friends', 'partners', 'schedule', 'resources', 'site', 'events'] as const;
type Kind = (typeof KINDS)[number];

const FILE: Record<Kind, string> = {
  friends: 'friends.json',
  partners: 'partners.json',
  schedule: 'schedule.json',
  resources: 'resources.json',
  site: 'site.json',
  events: 'events.json',
};

const FALLBACK: Record<Kind, unknown> = {
  friends: [],
  partners: [],
  schedule: { timezone: 'France (CET)', weeks: {} },
  resources: [],
  site: { theme: 'shibuya', twitchChannel: '' },
  events: [],
};

function isKind(k: string): k is Kind {
  return (KINDS as readonly string[]).includes(k);
}

// Validation de forme basique avant écriture.
function validate(kind: Kind, body: unknown): string | null {
  if (kind === 'friends' || kind === 'resources' || kind === 'partners') {
    if (!Array.isArray(body)) return 'Format attendu : tableau JSON.';
  } else if (kind === 'events') {
    if (!Array.isArray(body)) return 'Format attendu : tableau d\'événements.';
    for (const ev of body as Array<Record<string, unknown>>) {
      if (!ev || typeof ev !== 'object') return 'Événement invalide.';
      if (typeof ev.slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(ev.slug)) {
        return 'Chaque événement doit avoir un slug en minuscules (a-z, 0-9, -).';
      }
      if (!Array.isArray(ev.fields)) return 'Chaque événement doit avoir un tableau `fields`.';
    }
  } else if (kind === 'schedule') {
    const b = body as { weeks?: unknown; days?: unknown };
    const okNew = typeof b?.weeks === 'object' && b.weeks !== null && !Array.isArray(b.weeks);
    const okLegacy = Array.isArray(b?.days); // ancienne forme encore tolérée
    if (typeof body !== 'object' || body === null || (!okNew && !okLegacy)) {
      return 'Format attendu : { weeks: { "YYYY-MM-DD": { days: [...] } } }.';
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
contentRouter.post('/admin/content/:kind', requireRole('admin'), (req: Request, res: Response) => {
  const kind = req.params.kind;
  if (!isKind(kind)) return res.status(400).json({ error: 'Type de contenu inconnu.' });
  const err = validate(kind, req.body);
  if (err) return res.status(400).json({ error: err });
  write(FILE[kind], req.body);
  return res.json(req.body);
});
