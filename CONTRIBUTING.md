# Contribuer à SuricateWeb

Merci de votre intérêt. Le cœur de SuricateWeb est publié sous licence **GNU AGPL v3** ([LICENSE](LICENSE)). Une version hébergée, commerciale, est développée à part par le titulaire du projet à partir de ce cœur : c'est ce qui permet de le proposer gratuitement en auto-hébergement. Les règles ci-dessous le rendent possible sans ambiguïté juridique.

## Avant de commencer

- Ouvrez d'abord une issue pour une nouvelle fonction ou un changement important : cela évite un travail que le projet ne pourrait pas intégrer.
- Une faille de sécurité ne se signale **pas** dans une issue publique : voir [SECURITY.md](SECURITY.md).
- Lancez les tests (`node --disable-warning=ExperimentalWarning --test test/*.test.js`) et gardez le code, les messages et la documentation en français, les identifiants en anglais.

## Ce que vous acceptez en contribuant

Chaque commit d'une contribution doit porter une ligne de signature, ajoutée par `git commit -s` :

```
Signed-off-by: Prénom Nom <adresse@exemple.fr>
```

Elle signifie que vous acceptez le **Developer Certificate of Origin 1.1** (https://developercertificate.org), c'est-à-dire que vous avez le droit de proposer ce code (vous l'avez écrit, ou il provient d'une source dont la licence le permet) et que vous acceptez qu'il soit publié sous la licence du projet.

Vous acceptez en plus ceci :

1. Votre contribution est distribuée sous **AGPL-3.0**, comme le reste du cœur.
2. Vous accordez au titulaire du projet (Arnaud Roy) une licence mondiale, perpétuelle, gratuite et non exclusive pour utiliser, modifier et distribuer votre contribution **sous toute autre licence**, y compris propriétaire ou commerciale (version hébergée, licence commerciale pour des entreprises qui ne peuvent pas utiliser l'AGPL).
3. Vous conservez le copyright sur votre contribution.

Si vous ne pouvez pas accepter le point 2, ne soumettez pas de contribution : ouvrez plutôt une issue décrivant le besoin.

## Marque

« SuricateWeb » et son logo sont des marques de leur titulaire : la licence AGPL ne vous les concède pas. Voir la section « Licence et marque » du [README](README.md).
