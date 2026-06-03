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

// POST /api/admin/login { password } → { token }
authRouter.post('/login', loginLimiter, (req: Request, res: Response) => {
  if (!config.adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré côté serveur.' });
  }
  const password = (req.body && req.body.password) as unknown;
  if (typeof password !== 'string' || !safeEqual(password, config.adminPassword)) {
    return res.status(401).json({ error: 'Mot de passe invalide.' });
  }
  const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
  return res.json({ token });
});

// Middleware : protège les routes d'écriture. Exige Authorization: Bearer <token>.
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
