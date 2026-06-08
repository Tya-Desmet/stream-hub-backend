import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// Login Twitch (OAuth Authorization Code) pour les viewers — utilisé sur les giveaways.
// Stateless : le `state` est un court JWT signé (pas de store serveur). Au retour, on émet un
// "viewer-JWT" (identité vérifiée) renvoyé au site dans le fragment d'URL (#vt=...).

const TWITCH_AUTH = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS = 'https://api.twitch.tv/helix/users';

export type ViewerIdentity = { provider: 'twitch'; id: string; login: string; name: string };

export function twitchConfigured(): boolean {
  return !!(config.twitchClientId && config.twitchClientSecret && config.publicApiUrl && config.publicSiteUrl);
}

function redirectUri(): string {
  return `${config.publicApiUrl}/api/auth/twitch/callback`;
}

// Anti open-redirect : on n'accepte qu'un chemin relatif.
function safeReturn(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/events/';
}

// Vérifie un viewer-JWT → identité, ou null.
export function verifyViewer(token: string | undefined | null): ViewerIdentity | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as Record<string, unknown>;
    if (p.k === 'viewer' && p.provider === 'twitch' && p.id) {
      return { provider: 'twitch', id: String(p.id), login: String(p.login || ''), name: String(p.name || '') };
    }
    return null;
  } catch {
    return null;
  }
}

export const authTwitchRouter = Router();

// GET /api/auth/twitch/login?return=/events/<slug>/
authTwitchRouter.get('/auth/twitch/login', (req: Request, res: Response) => {
  if (!twitchConfigured()) return res.status(503).send('Login Twitch non configuré.');
  const ret = safeReturn(req.query.return);
  const state = jwt.sign({ ret, n: Math.random().toString(36).slice(2) }, config.jwtSecret, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: config.twitchClientId,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: '',
    state,
  });
  return res.redirect(`${TWITCH_AUTH}?${params.toString()}`);
});

// GET /api/auth/twitch/callback?code&state
authTwitchRouter.get('/auth/twitch/callback', async (req: Request, res: Response) => {
  if (!twitchConfigured()) return res.status(503).send('Login Twitch non configuré.');

  let ret = '/events/';
  try {
    const decoded = jwt.verify(String(req.query.state || ''), config.jwtSecret) as { ret?: string };
    ret = safeReturn(decoded.ret);
  } catch {
    return res.status(400).send('State invalide ou expiré.');
  }
  const code = String(req.query.code || '');
  if (!code) return res.redirect(`${config.publicSiteUrl}${ret}#vterr=1`);

  try {
    // 1) code → access_token
    const tokRes = await fetch(TWITCH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.twitchClientId,
        client_secret: config.twitchClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(),
      }),
    });
    if (!tokRes.ok) throw new Error('token');
    const tok = (await tokRes.json()) as { access_token?: string };
    if (!tok.access_token) throw new Error('no_token');

    // 2) access_token → utilisateur
    const uRes = await fetch(TWITCH_USERS, {
      headers: { Authorization: `Bearer ${tok.access_token}`, 'Client-Id': config.twitchClientId },
    });
    if (!uRes.ok) throw new Error('users');
    const uJson = (await uRes.json()) as { data?: Array<{ id: string; login: string; display_name: string }> };
    const u = uJson.data && uJson.data[0];
    if (!u) throw new Error('no_user');

    // 3) viewer-JWT (identité vérifiée), renvoyé dans le fragment d'URL
    const viewer = jwt.sign(
      { k: 'viewer', provider: 'twitch', id: u.id, login: u.login, name: u.display_name },
      config.jwtSecret,
      { expiresIn: '2h' },
    );
    const sep = ret.includes('#') ? '&' : '#';
    return res.redirect(`${config.publicSiteUrl}${ret}${sep}vt=${encodeURIComponent(viewer)}`);
  } catch {
    return res.redirect(`${config.publicSiteUrl}${ret}#vterr=1`);
  }
});
