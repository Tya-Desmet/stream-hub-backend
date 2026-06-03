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

export const uploadRouter = Router();

// POST /api/admin/upload (auth) — dépose un fichier téléchargeable.
uploadRouter.post('/admin/upload', requireAuth, upload.single('file'), (req: Request, res: Response) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  return res.json({ name: f.filename, size: f.size, path: `/files/${f.filename}` });
});
