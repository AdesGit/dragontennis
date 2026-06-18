---
name: dev-evolution
description: >-
  Orientation et reprise de développement pour l'app Dragon Tennis. Utilise ce skill dès le
  début de toute session de dev sur tennis : reprendre le projet, le faire évoluer, ajouter
  ou porter une fonctionnalité depuis l'app Dragon Padel (la source de référence), ou avoir une
  vue rapide de l'état, de l'infra et de l'architecture. Déclenche-le aussi quand l'utilisateur
  dit « reprends/continue le projet tennis », « fais évoluer X », « ajoute la fonctionnalité Y »,
  « reprends ce que fait padel », « comment c'est déployé / quelle est l'archi / où en est le
  projet ». En cas de doute sur l'état du projet tennis avant d'agir, charge-le.
---

# Dev Evolution — Dragon Tennis

Tu reprends le développement de **Dragon Tennis** (gestion des lumières de courts : solde en
crédits XPF, activation des lumières Legrand/Netatmo, admin). Ce skill t'oriente vite : où est la
vérité, comment c'est déployé, et comment **porter une fonctionnalité depuis Dragon Padel** sans te
tromper de stack.

## 1. Lis d'abord la vérité (ne pas deviner)

Ces docs versionnés dans le repo sont la source autoritative — lis-les avant d'agir. Si une info de
ce skill semble contredire les docs ou le live, **les docs et le système réel gagnent** (le skill
peut dater).

- `docs/ARCHITECTURE.md` — stack, URLs runtime, modèle de données, services, règles.
- `docs/DECISIONS.md` — décisions techniques datées (le **pourquoi**).
- `docs/ROADMAP.md` — livré / en cours / ensuite.
- `docs/runbooks/deployment.md` — ops : serveur, env Convex, deploy/build/restart, bootstrap admin.

Vérifie l'état réel quand ça compte : `git log --oneline -10`, `git branch --show-current`, et le
live `https://dragontennis.aidigitalassistant.cloud`.

## 2. Infra & archi en un coup d'œil

- **Stack** : Next.js 15 (App Router, React 18, TS strict) + **Convex auto-hébergé** (Docker) +
  `@convex-dev/auth` (Password, **invitation uniquement**) + Tailwind 3 (kit maison, **pas de MUI/Radix**)
  + `lucide-react` + `nodemailer` (Gmail SMTP).
- **Déploiement** : app **et** Convex co-localisés sur le VPS **72.62.129.117**.
  - App → `https://dragontennis.aidigitalassistant.cloud` (pm2 `tennis`, `next start -p 3001`).
  - Backend → `https://convex-tennis.aidigitalassistant.cloud` (Docker `convex-tennis`, sync `:3220`, http-actions/OIDC `:3221`).
  - nginx + Let's Encrypt. Détails et variables d'env → `docs/runbooks/deployment.md`.
- **Données** : `balance` = source de vérité ; `transactions` = ledger **append-only** ;
  activations « reserve-first » (débit avant allumage, recrédit auto si échec, reaper cron).

## 3. Padel = la source de référence pour les fonctionnalités

L'app mature est **Dragon Padel**, à `/home/claude/dev/apps/padel` (repo git séparé,
`git@github.com:…` — fais `git pull` pour la dernière version). Quand on « reprend une
fonctionnalité », on s'inspire de padel puis on l'**adapte à la stack tennis**.

**Différences de stack à toujours garder en tête lors d'un portage :**

| Aspect | Padel (source) | Tennis (cible) |
|---|---|---|
| Backend / DB | Firebase | **Convex** (queries/mutations/actions, schéma typé) |
| Auth | Firebase Auth | `@convex-dev/auth` (Password, invitation only) |
| UI | MUI + Radix + Tailwind + shadcn | **Tailwind uniquement** + kit maison `components/ui/` + `lucide-react` |
| Email | nodemailer | nodemailer (identique) |
| Thème | clair/sombre | **clair uniquement** |

**Playbook de portage d'une fonctionnalité :**
1. Localiser dans padel : `app/<feature>/`, `components/`, et la logique (pages/api ou utils).
   Au besoin, lancer un sous-agent `Explore` pour cartographier le design + la logique.
2. Extraire **l'intention** (le quoi/pourquoi), pas le code Firebase/MUI littéral.
3. Réécrire pour tennis : données → fonctions Convex (`convex/`, validators `v.*`, auth
   `getAuthUserId`/`requireAdmin`) ; UI → kit Tailwind maison + `lucide-react`, dans le shell
   (`components/app/AppShell`).
4. Vérifier (section 4), commit, déployer.

Le design language padel a déjà été porté (thème, shell, home, hub admin) — réutilise
`components/ui/` et `components/app/` plutôt que de réintroduire MUI/Radix.

## 4. Workflow dev & déploiement

```bash
# Travailler sur une branche (jamais committer/pusher sans demande explicite)
git checkout -b feat/<x> master

# Backend Convex (depuis le serveur)
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex deploy            # pousse convex/ + régénère _generated (à committer)

# Vérifier types/lint SÉPARÉMENT (next build OOM pendant son type-check interne sur ce serveur)
npx tsc --noEmit && npm run lint

# Build + mise en ligne app
NODE_OPTIONS="--max-old-space-size=2560" npm run build
pm2 restart tennis --update-env
# Chunk client incohérent après un build tué ? -> rm -rf .next puis rebuild.
```

Vérifier le résultat : routes en HTTPS (`curl -s -o /dev/null -w "%{http_code}"`), et `npx convex run`
pour les fonctions publiques/internes. Les fonctions admin-gated ne sont pas testables via `convex run`
(throw `Non authentifié` attendu) ; leur correction se vérifie par revue + types + le clic final navigateur.

## 5. Conventions non négociables

- **Pas de `any`** (types propres ou `unknown` + gardes). **Tailwind utilitaire uniquement**, jamais `style={{}}`.
- Chaque arg de fonction Convex a un validateur `v.*`. Public → auth via `getAuthUserId` ; admin → `requireAdmin`.
- Dans les actions, appeler `internal.*` (jamais `api.*`). Fichier `"use node"` = actions seules (DB dans un sibling V8).
- Inscription **sur invitation** uniquement. Email (invitation + reset) part via Gmail SMTP — creds dans l'**env Convex**.
- Reset de mot de passe = **par lien** (`/reset-password?email=&code=`), l'utilisateur ne saisit que son mot de passe.
- Committer/pusher **seulement sur demande**. Messages de commit terminés par la ligne `Co-Authored-By` Claude.
