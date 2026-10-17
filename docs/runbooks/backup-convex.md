# Runbook dev — Backup Convex Tennis

Ce document sert de référence rapide pour modifier, tester, planifier ou dépanner le système de backup Convex du projet Tennis.

## Objectif

Le système doit permettre :

1. un export quotidien des données Convex dans un fichier JSON simple ;
2. un import dry-run ou réel depuis ce JSON ;
3. l'envoi email du fichier généré, sans forcément envoyer un email tous les jours ;
4. une purge locale automatique des anciens backups ;
5. une configuration facile sans modifier le code.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `convex/backup.ts` | Fonctions Convex `exportData` et `importData`. Définit les tables incluses, le format JSON et la logique d'upsert/import. |
| `convex/http.ts` | Expose les routes HTTP `POST /backup/export` et `POST /backup/import`. |
| `scripts/convex-backup.cjs` | CLI bas niveau : export/import via les routes HTTP Convex. |
| `scripts/backup-cron.cjs` | Orchestrateur cron : export, email optionnel, purge. |
| `scripts/backup-daily.sh` | Wrapper shell appelé par npm/cron. |
| `app/admin/backup/page.tsx` | Page admin backup/import. |
| `components/BackupPanel.tsx` | UI admin pour export/import manuel. |
| `.env.local` | Config runtime locale/VPS du script cron. Non commitée. |
| `.env.example` | Exemple de variables à maintenir à jour. |
| `docs/runbooks/deployment.md` | Résumé opérationnel global. |

## Format du backup

Le backup est un JSON lisible :

```json
{
  "version": 1,
  "exportedAt": 1782920000000,
  "tables": {
    "users": [],
    "invites": [],
    "transactions": [],
    "activations": [],
    "courts": [],
    "faqEntries": []
  }
}
```

Les tables exportées sont définies dans `convex/backup.ts` :

```ts
const APP_TABLES = ["users", "invites", "transactions", "activations", "courts", "faqEntries"] as const;
```

Si une nouvelle table applicative doit être sauvegardée, il faut :

1. l'ajouter dans `APP_TABLES` ;
2. l'ajouter dans la query `exportData` ;
3. ajouter ou adapter la logique d'import dans `importData` ;
4. régénérer/mettre à jour les types Convex si nécessaire ;
5. tester export + import dry-run.

## Variables d'environnement

### Variables locales/VPS pour le CLI

Dans `.env.local` :

```bash
NEXT_PUBLIC_CONVEX_URL=https://convex-tennis.aidigitalassistant.cloud
CONVEX_SITE_URL=http://127.0.0.1:3221
BACKUP_ADMIN_SECRET=...

BACKUP_DIR=backups
BACKUP_RETENTION_DAYS=31
BACKUP_EMAIL_RECIPIENTS=christian.gall@gmail.com
BACKUP_EMAIL_FREQUENCY=weekly
BACKUP_EMAIL_WEEKDAY=1

GMAIL_USER=...
GMAIL_APP_PASSWORD=...
GMAIL_FROM="Dragon Tennis <...>"
```

Notes :

- `CONVEX_SITE_URL=http://127.0.0.1:3221` est recommandé sur le VPS, car il appelle directement le port HTTP actions Convex et évite les problèmes de routage nginx.
- `NEXT_PUBLIC_CONVEX_URL` reste utile pour l'app frontend et comme fallback du CLI.
- `BACKUP_ADMIN_SECRET` doit être identique dans `.env.local` et dans l'env Convex.
- `GMAIL_APP_PASSWORD` peut contenir des espaces ; le script les retire automatiquement.

### Variables Convex

`BACKUP_ADMIN_SECRET` doit aussi être défini côté Convex :

```bash
cd /home/claude/dev/apps/tennis
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex env set BACKUP_ADMIN_SECRET "..."
```

Pour vérifier les variables Convex :

```bash
npx convex env list
```

## Commandes manuelles

Depuis `/home/claude/dev/apps/tennis`.

### Export simple

```bash
npm run backup:export
```

Écrit par défaut :

```text
backups/tennis-backup-YYYY-MM-DD.json
```

Exporter vers un chemin précis :

```bash
node scripts/convex-backup.cjs export backups/test-backup.json
```

### Import dry-run

```bash
npm run backup:import -- backups/tennis-backup-YYYY-MM-DD.json
```

Le dry-run ne modifie pas la base. Il affiche un résumé par table : incoming, created, updated, skipped.

### Import réel

```bash
npm run backup:import -- backups/tennis-backup-YYYY-MM-DD.json --apply
```

À faire uniquement après un dry-run propre.

### Cron manuel sans email

```bash
npm run backup:daily -- --no-email
```

Utiliser ce test après chaque changement sur le système de backup.

### Cron manuel avec email forcé

```bash
npm run backup:daily -- --force-email
```

Cela ignore `BACKUP_EMAIL_FREQUENCY` et envoie immédiatement le fichier généré.

## Planification email évolutive

La fréquence d'email est contrôlée par `.env.local`, sans modifier le cron système.

### Backup quotidien + email hebdomadaire

```bash
BACKUP_EMAIL_FREQUENCY=weekly
BACKUP_EMAIL_WEEKDAY=1
```

`BACKUP_EMAIL_WEEKDAY` utilise `Date.getDay()` JavaScript :

| Valeur | Jour |
|---|---|
| `0` | dimanche |
| `1` | lundi |
| `2` | mardi |
| `3` | mercredi |
| `4` | jeudi |
| `5` | vendredi |
| `6` | samedi |

### Backup quotidien + email quotidien

```bash
BACKUP_EMAIL_FREQUENCY=daily
```

### Backup quotidien sans email

```bash
BACKUP_EMAIL_FREQUENCY=never
```

## Purge locale

La purge est exécutée à la fin de `scripts/backup-cron.cjs`.

```bash
BACKUP_RETENTION_DAYS=31
```

Elle supprime uniquement les fichiers qui matchent :

```text
backups/tennis-backup-*.json
```

Les fichiers backup sont ignorés par git via `.gitignore`, car ils contiennent des données réelles.

## Cron système

Cron actuel attendu :

```cron
30 2 * * * cd /home/claude/dev/apps/tennis && /usr/bin/flock -n /tmp/tennis-backup.lock /usr/bin/npm run backup:daily >> /home/claude/dev/apps/tennis/logs/backup-cron.log 2>&1
```

Le `flock` évite deux backups simultanés si une exécution précédente est encore en cours.

Voir le cron :

```bash
crontab -l
```

Modifier le cron :

```bash
crontab -e
```

Lire le log :

```bash
tail -n 100 logs/backup-cron.log
```

## Déploiement Convex après changement backend

Si tu modifies `convex/backup.ts`, `convex/http.ts`, le schéma ou les fonctions Convex, il faut redéployer Convex :

```bash
cd /home/claude/dev/apps/tennis
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex deploy
```

Sans déploiement, le CLI peut appeler une ancienne version des fonctions et échouer.

## Checklist dev avant de terminer une modification

1. Vérifier la syntaxe des scripts :

```bash
node --check scripts/backup-cron.cjs
node --check scripts/convex-backup.cjs
bash -n scripts/backup-daily.sh
```

2. Vérifier l'app :

```bash
npm run lint
npm run build
```

3. Si changement Convex :

```bash
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3220
export CONVEX_SELF_HOSTED_ADMIN_KEY="$(docker exec convex-tennis bash /convex/generate_admin_key.sh)"
npx convex deploy
```

4. Tester un backup réel sans email :

```bash
npm run backup:daily -- --no-email
```

5. Tester l'email si la partie mail a changé :

```bash
npm run backup:daily -- --force-email
```

6. Vérifier que le fichier existe :

```bash
stat backups/tennis-backup-$(date +%F).json
```

7. Vérifier le cron :

```bash
crontab -l | grep backup:daily
```

## Dépannage

### `Réponse non-JSON (404)` ou `No matching routes found`

Causes probables :

- les routes `/backup/export` et `/backup/import` ne sont pas déployées ;
- `CONVEX_SITE_URL` pointe vers le mauvais port ;
- nginx ne route pas le préfixe public `/backup/` vers les HTTP actions.

Solution recommandée sur le VPS :

```bash
CONVEX_SITE_URL=http://127.0.0.1:3221 npm run backup:daily -- --no-email
```

Si cela marche en local mais pas via le domaine public, corriger nginx. Le plus simple pour le cron VPS reste d'utiliser `CONVEX_SITE_URL=http://127.0.0.1:3221`.

### `Non authentifié`

Le CLI n'a pas été autorisé par `BACKUP_ADMIN_SECRET`.

Vérifier :

- `.env.local` contient `BACKUP_ADMIN_SECRET` ;
- Convex contient la même valeur : `npx convex env list` ;
- après un changement d'env Convex, relancer le test.

### `GMAIL_USER et GMAIL_APP_PASSWORD sont requis`

L'email est activé mais les credentials SMTP manquent dans `.env.local`.

Options :

- ajouter `GMAIL_USER` et `GMAIL_APP_PASSWORD` ;
- ou désactiver l'email avec `BACKUP_EMAIL_FREQUENCY=never` ;
- ou tester sans email avec `--no-email`.

### Email non envoyé alors que le backup marche

Vérifier :

```bash
npm run backup:daily -- --force-email
```

Si `--force-email` marche, la config de fréquence est probablement la cause :

```bash
BACKUP_EMAIL_FREQUENCY=weekly
BACKUP_EMAIL_WEEKDAY=1
```

Le script envoie seulement le jour configuré.

### Backup généré mais pas visible dans git

C'est normal. `backups/` est ignoré par git volontairement, car les fichiers contiennent des données de production.

### Le cron ne semble pas tourner

Vérifier :

```bash
crontab -l
tail -n 100 /home/claude/dev/apps/tennis/logs/backup-cron.log
```

Tester la commande exacte du cron manuellement :

```bash
cd /home/claude/dev/apps/tennis && /usr/bin/flock -n /tmp/tennis-backup.lock /usr/bin/npm run backup:daily
```

## Règles de sécurité

- Ne jamais commiter `.env.local` ni les fichiers de `backups/`.
- Ne jamais coller `BACKUP_ADMIN_SECRET` ou `GMAIL_APP_PASSWORD` dans la documentation ou les logs.
- Faire un import dry-run avant tout import réel.
- Ne pas purger manuellement `backups/` sans confirmer qu'un backup récent existe ailleurs.
- Pour un changement de format JSON, incrémenter `BACKUP_VERSION` et documenter la migration.
