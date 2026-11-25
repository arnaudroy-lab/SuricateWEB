# SuricateWeb — consignes pour Claude

## Version

À chaque modification du projet, incrémenter la version dans `package.json` (source unique, affichée dans la barre latérale) dans le même commit :

- correctif : `x.y.Z` ;
- nouvelle fonction : `x.Y.0`.

Si le changement touche un plugin (`plugins/`), mettre aussi à jour sa version (en-tête du plugin WordPress, `config.xml` et `suricateweb.php` du module PrestaShop) et régénérer les archives `plugins/*.zip`.

## Tests

`npm test` échoue avec cette version de Node ; utiliser :

```bash
node --disable-warning=ExperimentalWarning --test test/*.test.js
```

Les tests d'interface lancent Chrome ; sur une machine où son bac à sable est refusé (runner GitHub récent, conteneur), définir `CHROME_NO_SANDBOX=1`.

## Langue

Interface, messages, commentaires et documentation en français.
