/**
 * Migración 001 — fundaciones: usuarios, sesiones y espacios.
 * Cubre lo que necesita SPEC-001 y prepara el modelo multi-tenant (ADR-006).
 */
export const migration = {
  id: '001_init',
  up(db) {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_iterations INTEGER NOT NULL,
        name TEXT NOT NULL,
        base_currency TEXT NOT NULL DEFAULT 'GTQ',
        timezone TEXT NOT NULL DEFAULT 'America/Guatemala',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        ip TEXT,
        user_agent TEXT
      )
    `)
    db.exec('CREATE INDEX idx_sessions_user ON sessions(user_id)')
    db.exec('CREATE INDEX idx_sessions_expires ON sessions(expires_at)')

    db.exec(`
      CREATE TABLE spaces (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)

    db.exec(`
      CREATE TABLE space_members (
        space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (space_id, user_id)
      )
    `)
  }
}
