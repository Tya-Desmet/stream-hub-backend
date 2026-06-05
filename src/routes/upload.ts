import fs from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { requireAuth } from '../auth';

// Nom de fichier sûr (pas de traversal, caractères contrôlés).
function safeFileName(original: string): string {
  const base = path.basename(original).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.length > 0 ? base : 'fichier';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    cb(null, config.uploadsDir);
  },
  filename: (_req, file, cb) => cb(null, safeFileName(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 Mo (les très gros fichiers : préférer une URL externe)
});

// Images affichables inline (avatars, logos, bannières) — stockage séparé + servies sur /img.
const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(config.imagesDir, { recursive: true });
    cb(null, config.imagesDir);
  },
  // Préfixe horodaté → évite d'écraser deux images de même nom.
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${safeFileName(file.originalname)}`),
});

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo
  fileFilter: (_req, file, cb) => cb(null, IMAGE_MIME.has(file.mimetype)),
});

export const uploadRouter = Router();

// POST /api/admin/upload (auth) — dépose un fichier téléchargeable.
uploadRouter.post('/admin/upload', requireAuth, upload.single('file'), (req: Request, res: Response) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  return res.json({ name: f.filename, size: f.size, path: `/files/${f.filename}` });
});

// POST /api/admin/upload-image (auth) — dépose une image affichable inline (servie sur /img).
uploadRouter.post('/admin/upload-image', requireAuth, uploadImage.single('file'), (req: Request, res: Response) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Image invalide (png/jpeg/webp/gif/svg, ≤ 5 Mo).' });
  return res.json({ name: f.filename, size: f.size, path: `/img/${f.filename}` });
});
