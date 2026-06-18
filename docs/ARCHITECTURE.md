# Dragon Tennis — Architecture

Gestion des lumières de courts pour l'A.S. Dragon Tennis : solde en crédits (XPF), activation
des lumières (Legrand/Netatmo), administration (membres, crédits, stats, FAQ).

## Stack

- **Frontend** : Next.js 15.3.6 (App Router, React 18), TypeScript strict (pas de `any`), Tailwind CSS 3.
- **Backend** : [Convex](https://convex.dev) 1.34.x **auto-hébergé** (Docker) — base de données, queries/mutations/actions, crons.
- **Auth** : `@convex-dev/auth` 0.0.91, provider **Password**, inscription **sur invitation uniquement**, JWT (clés `JWT_PRIVATE_KEY`/`JWKS`).
- **Email** : `nodemailer` via **Gmail SMTP** (mot de passe d'application) — invitations + réinitialisation de mot de passe.
- **Matériel lumières** : API Legrand/Netatmo (`netatmoSetState`), différé jusqu'à la passe opérateur (creds + IDs de modules réels).
- **UI** : kit de composants Tailwind maison (`components/ui/`) + icônes `lucide-react`. Thème clair uniquement, palette inspirée de Dragon Padel (variables CSS).

## Runtime URLs

| Rôle | URL | Process |
|---|---|---|
| App (Next.js) | https://dragontennis.aidigitalassistant.cloud | pm2 `tennis` → `next start -p 3001` |
| Backend (Convex) | https://convex-tennis.aidigitalassistant.cloud | Docker `convex-tennis` (sync `:3220`, http-actions `:3221`) |

Les deux domaines pointent sur le serveur **72.62.129.117** (A records), reverse-proxy **nginx** + TLS **Let's Encrypt**. Voir `docs/runbooks/deployment.md`.

## Key directories

- `app/` — routes (App Router). Pages publiques : `/signin`, `/accept-invite/[token]`, `/forgot-password`, `/reset-password`. Pages authentifiées : `/dashboard`, `/activate`, `/credits`, `/history`, `/faq`. Admin : `/admin` (hub), `/members`, `/stats`, `/admin/faq`.
- `components/` — composants applicatifs ; `components/ui/` (kit : card/button/badge/avatar) ; `components/app/` (shell : AppShell, AppNavbarDesktop, BottomTabBar, BrandMark).
- `convex/` — backend : `schema.ts`, `users.ts`, `balance.ts`, `transactions.ts`, `activations.ts`, `members.ts`, `faq.ts`, `stats.ts`, `auth.ts`/`auth.config.ts`/`ResetEmail.ts`, `email.ts`, `legrand.ts`/`legrandDb.ts`, `crons.ts`. `_generated/` est régénéré par `npx convex deploy`.
- `lib/` — utilitaires (`cn`).
- `deploy/` — nginx + docker-compose Convex. `docs/` — architecture, décisions, roadmap, plans, runbooks.

## Modèle de données (tables Convex)

- `users{role,balance,status,email,firstName,lastName}` — `balance` est la **source de vérité**.
- `transactions{type:credit|debit|reversal,amount,balanceBefore,balanceAfter,reversalOf?}` — **ledger append-only** (index `by_user`, `by_reversal`).
- `activations{userId,court,durationMin,status:pending|active|used|failed,startTime,endTime,transactionId?}` (index `by_status`, `by_user`).
- `courts`, `legrandTokens`, `faqEntries{question,answer,order,category?}`, `invites{email,token,role,expiresAt,used}` (index `by_email`,`by_token`).

## Services & intégrations

- **Convex self-hosted** (Docker) : DB + fonctions + crons (`turnoff-due-lights` 1 min, `refresh-legrand` 30 min, `reap-stuck-pending` 5 min).
- **Convex Auth** : émetteur JWT = le domaine `convex-tennis…` (OIDC discovery `/.well-known/openid-configuration`).
- **Gmail SMTP** : `convex/email.ts` (`"use node"`) via `GMAIL_USER`/`GMAIL_APP_PASSWORD` dans l'**env Convex**.
- **nginx** + **certbot** + **pm2** + **Docker** sur le VPS (utilisateur `claude`, sudo passwordless).

## Sécurité / règles

- Public Convex functions vérifient l'auth (`getAuthUserId`) ; admin via `requireAdmin` (`users.ts`).
- Dans les actions, appeler `internal.*` (jamais `api.*`). Fichiers `"use node"` = actions uniquement (DB dans un sibling V8).
- Inscription impossible sans invitation valide (`auth.ts` `createOrUpdateUser`).
