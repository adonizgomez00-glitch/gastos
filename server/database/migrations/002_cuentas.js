/**
 * Migración 002 — cuentas (SPEC-002).
 * Schema canónico AGENT.md §6.1: sin UNIQUE(space_id, name) en BD; la unicidad
 * de nombre + moneda se valida en el Service y devuelve 409 (SPEC-002 §11).
 */
export const migration = {
  id: '002_cuentas',
  up(db) {
    db.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('cash','debit','credit')),
        currency TEXT NOT NULL CHECK (currency IN ('GTQ','USD')),
        opening_balance_cents INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    db.exec('CREATE INDEX idx_accounts_space_archived ON accounts(space_id, archived)')
  }
}
