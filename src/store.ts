import fs from 'fs';
import path from 'path';
import { config } from './config';

// Store de données = fichiers JSON dans config.dataDir.
// Écriture atomique (.tmp → rename). Lecture fallback-safe (ne lève jamais).
// Abstrait : remplaçable par une DB plus tard sans toucher aux routes.

fs.mkdirSync(config.dataDir, { recursive: true });

export function read<T>(file: string, fallback: T): T {
  try {
    const p = path.join(config.dataDir, file);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function write(file: string, data: unknown): void {
  const p = path.join(config.dataDir, file);
  const tmp = p + '.tmp';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}
