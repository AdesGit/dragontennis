# Runbook — Déploiement & opérations

## Serveur

- VPS **72.62.129.117** (utilisateur `claude`, `sudo` sans mot de passe). L'app **et** Convex y tournent.
- DNS (A → 72.62.129.117) : `dragontennis.aidigitalassistant.cloud` (app), `convex-tennis.aidigitalassistant.cloud` (backend).
- TLS : Let's Encrypt via `certbot --nginx` (renouvellement auto).
- nginx : vhosts `/etc/nginx/sites-available/{dragontennis,convex-tennis}` (proxy app `:3001`, Convex sync `:3220` + http-actions/OIDC `:3221`).
  - ⚠️ Cloud et site partagent **le même domaine** → nginx route par **chemin** : `/.well-known/`, `/http/` et `/legrand/` partent vers les http-actions (`:3221`), le reste vers le sync (`:3220`). **Toute nouvelle route HTTP action sous un préfixe inédit doit recevoir son `location … → :3221`** dans `sites-available/convex-tennis`, sinon elle tombe sur le sync et renvoie 404. Après édition : `sudo nginx -t && sudo systemctl reload nginx`.

## Convex (backend)

Conteneur Docker `convex-tennis` (compose dans `deploy/convex-tennis/`). Mapping :
container 3210 (cloud/sync) → host `127.0.0.1:3220` ; container 3211 (site/http-actions) → host `127.0.0.1:3221`.
`CONVEX_CLOUD_ORIGIN` = `CONVEX_SITE_ORIGIN` = `https://convex-tennis.aidigitalassistant.cloud`.

CLI depuis le serveur :
```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex deploy        # pousse convex/ + régénère _generated
npx convex env list      # variables d'environnement
npx convex logs          # logs des fonctions (console.log)
```

### Variables d'env Convex (obligatoires)

| Variable | Rôle |
|---|---|
| `SITE_URL` | `https://dragontennis.aidigitalassistant.cloud` (redirections auth) |
| `APP_URL` | idem (liens invitation + reset) |
| `JWT_PRIVATE_KEY`, `JWKS` | clés Convex Auth |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | envoi SMTP (mot de passe d'application Gmail) |

> Les creds Gmail doivent être dans l'**env Convex** (`npx convex env set …`), PAS dans `.env.local`
> (qui n'alimente que le build Next). Le mot de passe d'app peut contenir des espaces : le code les retire.

## App Next.js (frontend)

- `.env.local` : `NEXT_PUBLIC_CONVEX_URL=https://convex-tennis.aidigitalassistant.cloud` (baké au build).
- Process : pm2 `tennis` → `npm start` (`next start -p 3001`).

Déployer une nouvelle version :
```bash
cd /home/claude/dev/apps/tennis
NODE_OPTIONS="--max-old-space-size=2560" npm run build   # le worker de type-check OOM sans cette marge
pm2 restart tennis --update-env
```
> Vérifier types/lint **séparément** (`npx tsc --noEmit` + `npm run lint`) : `next build` peut OOM
> pendant son type-check interne sur ce serveur. En cas de chunk client incohérent : `rm -rf .next` puis rebuild.

## Bootstrap d'un admin

```bash
npx convex run members:seedAdminInvite '{"firstName":"X","lastName":"Y","email":"x@y.com"}'
# → renvoie un token ; lien = {APP_URL}/accept-invite/{token}
```
L'utilisateur ouvre le lien et définit son mot de passe (rôle admin stampé via l'invitation).

## Reset de mot de passe (parcours)

1. `/forgot-password` → email → `signIn(flow:"reset")` génère un code, `email.sendResetCode` envoie un **lien**.
2. Lien `{APP_URL}/reset-password?email=&code=` → la page lit le code, l'utilisateur saisit le nouveau mot de passe.
3. `signIn(flow:"reset-verification")` valide (code usage unique, 15 min).

## Différé (passe opérateur matériel)

Creds Legrand/Netatmo réels + `legrand.seedLegrandToken` + IDs de modules par court → test d'allumage réel.
