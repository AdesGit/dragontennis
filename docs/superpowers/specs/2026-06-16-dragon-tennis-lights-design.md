# Design — Dragon Tennis : gestion des lumières

> Spec validée le 2026-06-16. App neuve dans `/home/claude/dev/tennis`, dérivée du
> sous-système "lumières" de `../padel`, migrée de Firebase vers Convex.

## 1. Objectif & contexte

Créer l'application de gestion des lumières de la section Tennis de l'A.S. Dragon en
réutilisant la logique métier de l'app Padel existante (Next.js + Firebase), mais en
migrant entièrement le backend vers **Convex self-hosted**.

Le but n'est pas une réécriture from scratch : on **porte la logique pure** (appels
Legrand/Netatmo) et on **réécrit la plomberie** couplée à Firebase en Convex.

## 2. Périmètre

**Inclus (MVP) :**
Auth Convex · membres créés par admin · rôles admin/user · soldes · crédits · débits ·
**annulation** (transaction inverse) · historique immuable · activation lumières
Legrand/Netatmo · FAQ administrable · dashboards admin + user · recherche.

**Hors MVP (ajout ultérieur via WISC) :**
- **Météo** — n'existe pas dans padel ; rien à réutiliser, reporté.
- **Caméras** — reporté.

## 3. Stack

- **Frontend** : Next.js 15 (App Router), TypeScript, **Tailwind CSS uniquement** (pas de MUI).
- **Backend / DB / Auth** : Convex self-hosted + Convex Auth (Password provider).
- **API lumières** : Legrand / Netatmo (`api.netatmo.com`).
- **Email** : Convex action `'use node'` + nodemailer/SMTP (creds réutilisés de padel).

## 4. Topologie & déploiement

Décision : **instance Convex Docker dédiée** (pas de partage avec LifeLup, pas de Cloud).

```
/home/claude/dev/tennis/        ← app Next.js 15 (ce repo)
/opt/convex-tennis/
  docker-compose.yml            container convex-tennis, ports 127.0.0.1:3220 (sync) / 3221 (http)
  .env                          INSTANCE_NAME=convex-tennis, INSTANCE_SECRET UNIQUE,
                                CONVEX_CLOUD_ORIGIN/SITE_ORIGIN=https://convex-tennis.aidigitalassistant.cloud
  data/                         SQLite isolé
Nginx vhost  → convex-tennis.aidigitalassistant.cloud → 127.0.0.1:3220 (+ 3221 http actions)
App Next.js  → PM2 'tennis', port 3001 (3000 = lifelup, confirmé libre)
Domaine app  → tennis.aidigitalassistant.cloud (à confirmer au déploiement)
```

Trois conteneurs Convex coexistent sur le VPS : `convex-backend` (lifelup, 3210/3211),
`convex-tennis` (3220/3221), aucun partage de données.

**Secrets régénérés pour Tennis** (ne jamais réutiliser ceux de LifeLup/padel) :
`JWT_PRIVATE_KEY`, `JWKS`, `AGENT_SECRET`, VAPID si push ajouté plus tard.

**Gotcha repris de LifeLup** : `auth.config.ts` doit utiliser `||` et **jamais `??`**
pour le fallback de `CONVEX_SITE_URL` (sinon `iss: ""` → `NoAuthProvider` sur chaque query).

## 5. Schéma Convex (`convex/schema.ts`)

| Table | Champs clés | Notes |
|---|---|---|
| `users` | email, firstName, lastName, role(`admin`\|`user`), **balance**, status(`invited`\|`active`), createdAt | `balance` = **source de vérité unique** |
| `transactions` | userId, type(`credit`\|`debit`\|`reversal`), amount, **balanceBefore**, **balanceAfter**, comment?, authorId, court?, durationMin?, activationId?, **reversalOf?**, createdAt | **immuable** — jamais de delete |
| `activations` | userId, court(1\|2\|3), durationMin(30\|60), amount, status(`pending`\|`active`\|`used`\|`failed`), startTime, endTime, netatmoResponse?, transactionId? | journal des allumages |
| `legrandTokens` | accessToken, refreshToken, expiresIn, obtainedAt | refresh par cron + lazy |
| `courts` | courtNumber, label, moduleId, bridgeId, homeId, active | mapping device (remplace les IDs en dur de padel) |
| `faqEntries` | question, answer, order, category | **administrable** |
| `invites` | email, token, expiresAt, used | flux invitation membre |
| `...authTables` | (spread Convex Auth) | Password provider |

Le **modèle de solde** : un seul champ `balance` autoritatif sur `users`, plus un **ledger
immuable** `transactions` avec `balanceBefore`/`balanceAfter`. Tout débit/crédit se fait
dans **une mutation atomique** (maj balance + insert ledger). Évite le bug d'anomalies de
padel (qui dupliquait balance champ + recalcul par agrégation).

## 6. Modules Convex (1 fichier par domaine, < 300 lignes)

```
auth.ts          Password provider, sign-up public désactivé
auth.config.ts   issuer avec fallback en || (jamais ??)
users.ts         getMe, listMembers(admin), updateMember(admin)
members.ts       createMember+invite(admin), acceptInvite
balance.ts       creditAccount(admin), reverseTransaction(admin)   — mutations atomiques
activations.ts   activateLight (action 'use node'), turnoffDue (interne, cron)
legrand.ts       'use node' — getValidToken, refreshToken, netatmoSetState, netatmoHomeStatus
transactions.ts  listForUser, listAll(admin), search
courts.ts        list, upsert(admin)
faq.ts           list(public), create/update/remove(admin)
stats.ts         adminDashboard (nb activations, CA, crédits distribués, users actifs)
email.ts         'use node' — sendInvite, sendPasswordReset (nodemailer/SMTP)
crons.ts         refresh-legrand (30 min), turnoff-due-lights (1 min)
```

Règles de style (reprises de LifeLup CLAUDE.md) : pas de `any`, validateurs `v` explicites
sur chaque arg, fonctions publiques vérifient l'auth via `getAuthUserId(ctx)`, fonctions
internes (agent/cron) sans auth.

## 7. Flux d'activation (cœur métier, transactionnel)

```
UI: bouton « Court N · 30 min / 1 h »
  → action activateLight(court, durationMin)
     1. query : solde suffisant ?  → sinon throw « solde insuffisant » (lumière NON lancée)
     2. legrand.getValidToken()    → refresh lazy si expiration < 60 s
     3. POST netatmo setstate {on:true}   (axios, +1 retry sur 502/503/504/429)
        → si échec API : status=failed, pas de débit
     4. mutation atomique :
          - users.balance -= coût
          - insert transaction {type:debit, balanceBefore, balanceAfter, court, durationMin}
          - insert activation {status:active, startTime, endTime}
     5. return confirmation (solde restant, fin prévue)

cron turnoff-due-lights (1 min) :
  activations où endTime < now & status = active
    → netatmo setstate {on:false} → vérif homestatus → status = used
```

**Tarifs** : Court 1/2/3, 30 min = 250 XPF, 1 h = 500 XPF. Interface = 6 boutons.

**Réutilisé de padel** : logique pure Netatmo (`setstate`, `homestatus`, retry, mapping
court→moduleId/bridgeId/homeId). **Réécrit** : toute la plomberie Firebase de
`pages/api/TurnOnDevice.js` (780 lignes) → mutations/actions Convex.

## 8. Annulation (neuf — absent de padel)

`reverseTransaction(txId)` (admin) :
- crée une transaction `type:reversal`, `amount` inverse, `reversalOf: txId` ;
- recalcule `balanceBefore`/`balanceAfter` et met à jour `users.balance` atomiquement ;
- **aucune suppression physique** — l'historique reste complet et auditable.

Couvre l'annulation d'un crédit **et** d'un débit (les deux créent une transaction inverse).

## 9. Auth & gestion des membres

- **Convex Auth Password**, inscription publique **désactivée**.
- Admin crée un membre (nom, prénom, email) → `users{status:invited, balance:0, role:user}`
  + `invites{token, expiresAt}` → `email.sendInvite(email, token)`.
- Le membre ouvre `accept-invite/[token]` → définit son mot de passe → `status:active`.
- Reset mot de passe → flux Convex Auth + `email.sendPasswordReset`.
- Protection des routes : layout serveur + `getMe` (rôle). Pattern repris de LifeLup
  (redirection si non authentifié / rôle insuffisant).

## 10. Frontend (`app/`)

```
signin                       connexion
forgot-password              demande de reset
accept-invite/[token]        définition du mot de passe (membre invité)

(user)
  dashboard                  solde, historique perso, activations récentes, FAQ
  activate                   6 boutons : 3 courts × (30 min / 1 h)

(admin)
  members                    liste / créer / modifier / recherche
  credits                    créditer / corriger / annuler
  history                    transactions + activations + recherche
  stats                      activations, CA, crédits distribués, users actifs
  faq                        CRUD
```

**Tailwind-only**, **mobile-first** (priorité expérience mobile). Les composants utiles de
padel sont **reconstruits en Tailwind**, pas copiés (padel mélange MUI + Radix).

## 11. Réutilisation : verdict

| Élément padel | Action |
|---|---|
| Logique Netatmo setstate/homestatus/retry | ✅ **Porter** (pur, sans Firebase) |
| Mapping court → device IDs | ✅ Porter dans la table `courts` |
| `TurnOnDevice.js` (plomberie, 780 L) | ❌ Réécrire en Convex |
| Firebase Auth / Firestore | ❌ Remplacer par Convex / Convex Auth |
| Refresh token via n8n (externe) | ❌ Remplacer par **cron Convex natif** (+ refresh lazy) |
| FAQ JSX hardcodée | ♻️ Contenu repris, structure → table `faqEntries` |
| nodemailer / SMTP | ✅ Réutiliser la configuration |
| Composants UI MUI | ♻️ Reconstruire en Tailwind |

## 12. À confirmer au déploiement

- **Domaine** de l'app : `tennis.aidigitalassistant.cloud` (proposé).
- **Port PM2** : 3001 (3000 occupé par lifelup — vérifié).
- **IDs Legrand réels des 3 courts tennis** (`moduleId`/`bridgeId`/`homeId`) : à fournir par
  le club. À défaut, placeholders en table `courts` à remplir au déploiement.
- **Creds SMTP** réutilisés de padel : à reporter en env Convex tennis.

## 13. Livrables

Schéma Convex · migration Firebase→Convex · Auth Convex · rôles · membres+invitation ·
crédits/débits/annulation · transactions (ledger) · activation lumières · FAQ administrable ·
dashboards user+admin · recherche · docs installation/déploiement/technique.

## 14. Validation (avant déploiement)

1. `npm run build` — zéro erreur TS.
2. `npm run lint` — zéro warning.
3. `npx convex deploy` (instance tennis) — schéma valide, fonctions déployées.
4. Test manuel : solde insuffisant → lumière non lancée ; activation OK → débit + ledger
   cohérents ; annulation → transaction inverse, balance restaurée, historique intact.
5. Endpoint Legrand : token expiré → refresh auto ; setstate échec → status `failed`, pas de débit.
