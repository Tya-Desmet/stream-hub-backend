import crypto from 'crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from './config';

// Anti brute-force sur le login.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessaie plus tard.' },
});

// Comparaison à temps constant (évite les attaques temporelles).
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export const authRouter = Router();

export type Role = 'admin' | 'mod';

// POST /api/admin/login { password } → { token, role }
authRouter.post('/login', loginLimiter, (req: Request, res: Response) => {
  if (!config.adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré côté serveur.' });
  }
  const password = (req.body && req.body.password) as unknown;
  if (typeof password !== 'string') {
    return res.status(401).json({ error: 'Mot de passe invalide.' });
  }

  let role: Role | null = null;
  if (safeEqual(password, config.adminPassword)) role = 'admin';
  else if (config.modPassword && safeEqual(password, config.modPassword)) role = 'mod';

  if (!role) return res.status(401).json({ error: 'Mot de passe invalide.' });

  const token = jwt.sign({ role }, config.jwtSecret, { expiresIn: '12h' });
  return res.json({ token, role });
});

// Middleware : exige un token valide (n'importe quel rôle).
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Token manquant.' });
  try {
    jwt.verify(match[1], config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

// Middleware : exige un token valide ET un rôle autorisé (sinon 403).
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ error: 'Token manquant.' });
    try {
      const payload = jwt.verify(match[1], config.jwtSecret) as { role?: Role };
      if (!payload.role || !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Accès refusé pour ce rôle.' });
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'Token invalide ou expiré.' });
    }
  };
}
