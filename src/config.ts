import 'dotenv/config';
import path from 'path';

// Configuration centralisée (variables d'environnement). Aucun secret en dur.
export const config = {
  port: Number(process.env.PORT) || 4000,
  // CORS : '*' (dev) ou liste de domaines séparés par des virgules.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  pushApiKey: process.env.PUSH_API_KEY || '',
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
};

export function corsOriginOption(): boolean | string[] {
  if (config.corsOrigin === '*') return true;
  return config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
}
