/**
 * Migración 003 — categorías (SPEC-003).
 * Schema canónico AGENT.md §6.1: jerarquía de un solo nivel (padre raíz → hijo),
 * UNIQUE(space_id, kind, name) garantiza unicidad por tipo y espacio.
 */
export const migration = {
  id: '003_categorias',
  up(db) {
    db.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
        parent_id TEXT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        color TEXT,
        icon TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (space_id, kind, name)
      )
    `)
    db.exec('CREATE INDEX idx_categories_space_kind_archived ON categories(space_id, kind, archived)')
    db.exec('CREATE INDEX idx_categories_parent ON categories(parent_id)')
  }
}
