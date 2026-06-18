# Dragon Tennis — Roadmap

## Livré

- [x] **Phase 1** — infra Convex + auth (invitation, mot de passe, JWT).
- [x] **Phase 2** — solde/ledger + activation Legrand (reserve-first, recrédit, crons).
- [x] **Phase 3** — dashboards (stats admin, espace membre), FAQ administrable, liste membres + invités en attente, AdminGate + nav.
- [x] **Déploiement public** — DNS + TLS (dragontennis + convex-tennis), nginx, pm2, admin bootstrap.
- [x] **Design** — portage de l'identité Dragon Padel (thème, shell mobile-first, home, hub admin).
- [x] **Email** — Gmail SMTP (nodemailer, mot de passe d'app) ; invitations + reset partent réellement.
- [x] **Reset par lien** — code dans le lien email, l'utilisateur ne saisit que son mot de passe.

## En cours

- [ ] Merger `feat/design-padel` → `master` et push GitHub (design + SMTP + reset par lien).

## Ensuite

- [ ] **Passe matériel Netatmo/Legrand** : creds réels, IDs de modules par court, seed token, test d'allumage de bout en bout.
- [ ] Retirer la dépendance `googleapis` (plus utilisée depuis le passage à SMTP).
- [ ] Restyle des pages internes admin au kit de composants (différé du périmètre design).
- [ ] Bouton « changer mon mot de passe » connecté (en plus du reset par email).

## Hors MVP (différé)

- [ ] Météo, caméras (explicitement hors périmètre depuis la spec).
