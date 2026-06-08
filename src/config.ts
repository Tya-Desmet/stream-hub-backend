import 'dotenv/config';
import path from 'path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Configuration centralisée (variables d'environnement). Aucun secret en dur.
export const config = {
  port: Number(process.env.PORT) || 4000,
  // CORS : '*' (dev) ou liste de domaines séparés par des virgules.
  corsOrigin: process.env.CORS_ORIGIN || '*',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Mot de passe modo (accès restreint : inscriptions + tirage, pas d'édition de contenu).
  modPassword: process.env.MOD_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  pushApiKey: process.env.PUSH_API_KEY || '',
  dataDir,
  // Fichiers téléchargeables uploadés (persistants, servis sur /files, forcés en téléchargement).
  uploadsDir: process.env.UPLOADS_DIR || path.join(dataDir, 'files'),
  // Images affichables inline (avatars streamers, logos partenaires, bannières), servies sur /img.
  imagesDir: process.env.IMAGES_DIR || path.join(dataDir, 'images'),
  // Webhook Discord (notifications d'inscription événement). Optionnel.
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  // Login Twitch des viewers (giveaways). Vide = login désactivé.
  twitchClientId: process.env.TWITCH_CLIENT_ID || '',
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  // URLs publiques (pour le redirect OAuth et le retour sur le site).
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),
  publicSiteUrl: (process.env.PUBLIC_SITE_URL || '').replace(/\/+$/, ''),
};

export function corsOriginOption(): boolean | string[] {
  if (config.corsOrigin === '*') return true;
  return config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
}
