/**
 * Aplica las migraciones pendientes de forma idempotente (docs/DATABASE.md §3).
 * Seguro de ejecutar en cada arranque.
 * @param {import('node:sqlite').DatabaseSync} db conexión
 * @param {Array<{id: string, up: (db: any) => void}>} migrations migraciones ordenadas
 * @returns {{ applied: string[], skipped: string[] }} detalle de lo ejecutado
 */
export function applyMigrations(db, migrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const done = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id))
  const applied = []
  const skipped = []

  for (const migration of migrations) {
    if (done.has(migration.id)) {
      skipped.push(migration.id)
      continue
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString()
      )
      db.exec('COMMIT')
      applied.push(migration.id)
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return { applied, skipped }
}
