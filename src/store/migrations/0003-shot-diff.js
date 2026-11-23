// Migration 3 : comparaison des captures d'écran. Chaque capture garde la différence mesurée avec la capture précédente du site :
//   diff_pct   pourcentage de la page qui a changé (0 à 100), NULL si la comparaison n'est pas faite (désactivée, première capture, image absente)
//   diff_file  image « différence » (la capture assombrie, les zones modifiées en rouge), fichier à côté de la capture ; NULL sans différence
//   diff_vs    identifiant de la capture à laquelle on a comparé
const sqlite = (db) =>
  db.exec(`
    ALTER TABLE screenshots ADD COLUMN diff_pct REAL;
    ALTER TABLE screenshots ADD COLUMN diff_file TEXT;
    ALTER TABLE screenshots ADD COLUMN diff_vs INTEGER;
  `);

const postgres = (db) =>
  db.exec(`
    ALTER TABLE screenshots ADD COLUMN diff_pct DOUBLE PRECISION;
    ALTER TABLE screenshots ADD COLUMN diff_file TEXT;
    ALTER TABLE screenshots ADD COLUMN diff_vs BIGINT;
  `);

export default { version: 3, name: 'shot-diff', sqlite, postgres };
