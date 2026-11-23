// Migration 4 : journal d'activité des sites WordPress (connexions, comptes, extensions), relevé depuis le plugin.
// Une ligne par événement ; (watch_id, event_id) identifie l'événement du plugin, ce qui rend le relevé idempotent (un événement relu est remplacé).
// L'adresse IP n'est JAMAIS complète : tronquée par le plugin (IPv4 /24, IPv6 /48), plus une empreinte salée pour reconnaître une même source.
// Conservation : 90 jours (voir ACTIVITY_KEEP_DAYS dans src/db.js), purgés à chaque relevé.
const sqlite = (db) =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS cms_activity (
      watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      event_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL DEFAULT '',
      n INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (watch_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_activity_ts ON cms_activity(watch_id, ts DESC);
  `);

const postgres = (db) =>
  db.exec(`
    CREATE TABLE IF NOT EXISTS cms_activity (
      watch_id BIGINT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      event_id BIGINT NOT NULL,
      ts BIGINT NOT NULL,
      kind TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL DEFAULT '',
      n BIGINT NOT NULL DEFAULT 1,
      PRIMARY KEY (watch_id, event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cms_activity_ts ON cms_activity(watch_id, ts DESC);
  `);

export default { version: 4, name: 'cms-activity', sqlite, postgres };
