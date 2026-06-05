import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { read, write } from '../store';
import { requireAuth } from '../auth';
import { config } from '../config';
import { validateSubmission, submissionLabel, type EventDef } from '../lib/fields';

// ── Helpers store ──────────────────────────────────────────────────────────
function loadEvents(): EventDef[] {
  const list = read<EventDef[]>('events.json', []);
  return Array.isArray(list) ? list : [];
}
function saveEvents(list: EventDef[]): void {
  write('events.json', list);
}
function findEvent(slug: string): EventDef | undefined {
  return loadEvents().find((e) => e.slug === slug);
}
// Nom de fichier sûr (le slug est déjà validé a-z0-9- au save, ceinture + bretelles).
function subsFile(slug: string): string {
  return `submissions/${slug.replace(/[^a-z0-9-]/gi, '_')}.json`;
}
type Submission = { id: string; at: number; ip?: string; values: Record<string, string | boolean> };
function loadSubs(slug: string): Submission[] {
  const list = read<Submission[]>(subsFile(slug), []);
  return Array.isArray(list) ? list : [];
}

function isOpen(ev: EventDef): boolean {
  if (!ev.open) return false;
  if (ev.closeAt) {
    const t = Date.parse(ev.closeAt);
    if (!Number.isNaN(t) && t < Date.now()) return false;
  }
  return true;
}

// Vue publique : jamais de winners/webhook/IP.
function publicView(ev: EventDef) {
  return {
    id: ev.id,
    slug: ev.slug,
    title: ev.title,
    description: ev.description,
    banner: ev.banner,
    type: ev.type,
    open: isOpen(ev),
    closeAt: ev.closeAt,
    fields: ev.fields,
    confirmation: ev.confirmation,
  };
}

// ── Webhook Discord (fire-and-forget) ───────────────────────────────────────
function notifyDiscord(ev: EventDef, values: Record<string, string | boolean>): void {
  const url = ev.webhookUrl || config.discordWebhookUrl;
  if (!url) return;
  const fields = ev.fields
    .filter((f) => values[f.key] !== undefined && values[f.key] !== '')
    .map((f) => ({ name: f.label, value: String(values[f.key]).slice(0, 256), inline: true }));
  const payload = {
    embeds: [
      {
        title: `Nouvelle inscription — ${ev.title}`,
        color: 0x9146ff,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
  // Node 18+ : fetch global. Jamais bloquant, on avale les erreurs.
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ── Anti-abus inscription ───────────────────────────────────────────────────
const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop d\'inscriptions. Réessaie plus tard.' },
});

export const eventsRouter = Router();

// GET /api/events → événements OUVERTS (vue publique)
eventsRouter.get('/events', (_req: Request, res: Response) => {
  res.json(loadEvents().filter(isOpen).map(publicView));
});

// GET /api/events/:slug → un événement (vue publique)
eventsRouter.get('/events/:slug', (req: Request, res: Response) => {
  const ev = findEvent(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
  return res.json(publicView(ev));
});

// POST /api/events/:slug/register (public) → inscription
eventsRouter.post('/events/:slug/register', registerLimiter, (req: Request, res: Response) => {
  const body = (req.body || {}) as { values?: Record<string, unknown>; _hp?: unknown };

  const ev = findEvent(req.params.slug);
  const defaultMsg = ev?.confirmation || 'Inscription bien enregistrée ✓';

  // Honeypot : un bot remplit le champ caché → on répond OK mais on ne stocke rien.
  if (typeof body._hp === 'string' && body._hp.trim() !== '') {
    return res.json({ ok: true, message: defaultMsg });
  }

  if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
  if (!isOpen(ev)) return res.status(403).json({ error: 'Les inscriptions sont fermées.' });

  const { ok, errors, clean } = validateSubmission(ev, body.values || {});
  if (!ok) return res.status(400).json({ error: 'Champs invalides.', errors });

  const subs = loadSubs(ev.slug);

  // Anti-doublon : une seule inscription par identifiant (Discord en priorité,
  // sinon Riot/Minecraft/Twitch/email, sinon le 1er champ texte). Empêche les
  // inscriptions à l'infini (notamment sur les giveaways).
  const idField =
    ev.fields.find((f) => f.type === 'discord') ||
    ev.fields.find((f) => ['riot', 'minecraft', 'twitch', 'email'].includes(f.type)) ||
    ev.fields.find((f) => f.type === 'text');
  if (idField) {
    const v = String(clean[idField.key] ?? '').trim().toLowerCase();
    if (v && subs.some((s) => String(s.values[idField.key] ?? '').trim().toLowerCase() === v)) {
      return res.status(409).json({ error: `Tu es déjà inscrit avec ce ${idField.label}.` });
    }
  }

  const sub: Submission = {
    id: crypto.randomUUID(),
    at: Date.now(),
    ip: req.ip,
    values: clean,
  };
  subs.push(sub);
  write(subsFile(ev.slug), subs);

  notifyDiscord(ev, clean);

  return res.json({ ok: true, message: defaultMsg });
});

// ── Admin ───────────────────────────────────────────────────────────────────

function toCsv(ev: EventDef, subs: Submission[]): string {
  const cols = ['at', ...ev.fields.map((f) => f.key)];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['date', ...ev.fields.map((f) => f.label)].map(esc).join(',');
  const rows = subs.map((s) =>
    cols
      .map((c) => (c === 'at' ? new Date(s.at).toISOString() : s.values[c]))
      .map(esc)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

// GET /api/admin/events/:slug/submissions (auth) [?format=csv]
eventsRouter.get('/admin/events/:slug/submissions', requireAuth, (req: Request, res: Response) => {
  const ev = findEvent(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });
  const subs = loadSubs(ev.slug);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ev.slug}.csv"`);
    return res.send(toCsv(ev, subs));
  }
  return res.json({ count: subs.length, submissions: subs, winners: ev.winners || [] });
});

// POST /api/admin/events/:slug/draw (auth) { count, excludeWinners } → tirage
eventsRouter.post('/admin/events/:slug/draw', requireAuth, (req: Request, res: Response) => {
  const list = loadEvents();
  const ev = list.find((e) => e.slug === req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Événement introuvable.' });

  const count = Math.max(1, Math.min(50, Number((req.body || {}).count) || 1));
  const excludeWinners = (req.body || {}).excludeWinners !== false; // défaut: exclure
  const already = new Set((ev.winners || []).map((w) => w.entryId));

  let pool = loadSubs(ev.slug);
  if (excludeWinners) pool = pool.filter((s) => !already.has(s.id));
  if (pool.length === 0) return res.status(400).json({ error: 'Aucun participant éligible.' });

  // Tirage uniforme sans remise (crypto).
  const picked: Submission[] = [];
  const copy = [...pool];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const j = crypto.randomInt(copy.length);
    picked.push(copy.splice(j, 1)[0]);
  }

  const at = Date.now();
  const newWinners = picked.map((s) => ({ entryId: s.id, label: submissionLabel(ev, s.values), at }));
  ev.winners = [...(ev.winners || []), ...newWinners];
  saveEvents(list);

  return res.json({ winners: newWinners, totalWinners: ev.winners.length, pool: pool.length });
});
