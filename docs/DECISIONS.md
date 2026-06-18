# Dragon Tennis — Décisions techniques

Décisions stables, du plus récent au plus ancien.

### 2026-06-18 — Réinitialisation de mot de passe par lien

Context : le formulaire de reset demandait un **code** saisi à la main ; l'autofill du navigateur
remplissait ce champ avec l'email → confusion.

Decision : l'email de reset contient un **lien** `…/reset-password?email=&code=` ; la page
`/reset-password` lit le code dans l'URL et l'utilisateur ne saisit **que** son nouveau mot de
passe. `/forgot-password` est réduit à « saisir l'email → confirmation ».

Consequences : zéro saisie de code, plus d'ambiguïté. Le code (Convex Auth) reste à usage unique,
15 min. Backend de vérification inchangé.

### 2026-06-18 — Email via Gmail SMTP (mot de passe d'application), pas OAuth

Context : `convex/email.ts` utilisait l'OAuth2 `googleapis` (3 creds + setup Google Cloud). Lourd.

Decision : envoi via **`nodemailer` + Gmail SMTP** avec `GMAIL_USER`/`GMAIL_APP_PASSWORD`. Les
variables vivent dans l'**env Convex** (le runtime qui exécute l'envoi), pas dans `.env.local` Next.

Consequences : invitations + reset partent réellement. La garde « dry-run » teste `GMAIL_USER`.
`googleapis` n'est plus utilisé (à retirer des deps). Cohérent avec Dragon Padel (nodemailer).

### 2026-06-18 — Portage du design language de Dragon Padel

Context : tennis était nu (Tailwind brut). Objectif : reprendre l'identité visuelle de padel.

Decision : reproduire le look padel **sans MUI/Radix** — variables CSS (palette indigo `#6645ba` /
accent `#d66e29`), petit kit `components/ui/`, shell mobile-first (`components/app/`), **thème clair
uniquement**. Seule dépendance ajoutée : `lucide-react`.

Consequences : design cohérent avec padel tout en gardant la stack Tailwind/Convex propre. Périmètre :
thème + shell + home + hub admin ; pages internes héritent du thème/shell (contenu inchangé).

### 2026-06-17 — Déploiement auto-hébergé sur un seul VPS

Context : besoin d'un accès public (DNS `dragontennis.aidigitalassistant.cloud`).

Decision : app Next (pm2) **et** backend Convex (Docker) **co-localisés** sur le VPS 72.62.129.117,
chacun sur son sous-domaine, derrière nginx + TLS Let's Encrypt.

Consequences : un seul serveur à opérer. `convex-tennis` doit être public (auth JWT/OIDC). Voir runbook.

### 2026-06 — Convex (auto-hébergé) remplace Firebase

Context : objectif de migrer l'auth/back de Firebase vers Convex.

Decision : Convex comme backend unique (DB + fonctions + auth + crons), type-safe de bout en bout.

Consequences : `balance` source de vérité ; `transactions` ledger **append-only** ; réservation
« reserve-first » pour les activations (débit avant allumage, recrédit auto en cas d'échec, reaper
cron des `pending` bloqués). Inscription **sur invitation uniquement** (pas de signup public).
