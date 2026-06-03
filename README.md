# Stream Hub — Backend

Petit backend Node/Express (TypeScript) : contenu éditorial **persistant** pour l'admin du
hub, et (option) données temps réel poussées par le bot. Stockage = fichiers JSON.

> Hébergement cible : **Infomaniak — Node.js managé** (Node 24). L'app écoute sur
> `process.env.PORT` (reverse-proxy + HTTPS gérés par Infomaniak).

## Développement

```bash
cp .env.example .env   # renseigner ADMIN_PASSWORD, JWT_SECRET, CORS_ORIGIN
npm install
npm run dev            # http://localhost:4000/health
```

## Build / production

```bash
npm run build          # → dist/
npm start              # node dist/index.js (lit les variables d'env)
```

## Variables d'environnement

Voir `.env.example`. **Aucun secret n'est commité** ; en prod, les définir dans le panel
Infomaniak.

## Endpoints (au fil des lots)

- `GET /health` — état du service (B01)
- `POST /api/admin/login` — auth → JWT (B02)
- `GET /api/content` · `POST /api/admin/content/:kind` — contenu éditorial (B03)
- `POST /api/push` · `GET /api/leaderboard` · `GET /api/users/:id` — temps réel (B06, option)

## Déploiement Infomaniak (résumé — détail en V3.7/B07)

- Déploiement par **Git** (recommandé), SSH, SFTP ou archive ZIP.
- Définir les variables d'env (ADMIN_PASSWORD, JWT_SECRET, CORS_ORIGIN, PUSH_API_KEY).
- ⚠️ **Persistance de `data/`** : s'assurer que le dossier de données survit aux
  redéploiements (idéalement `DATA_DIR` hors de l'arbre redéployé). Prévoir un backup.
