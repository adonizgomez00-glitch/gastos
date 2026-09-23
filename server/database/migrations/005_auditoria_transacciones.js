/**
 * Migración 005 — auditoría y transacciones.
 * `audit_log` es obligatorio desde SPEC-002/003 (I-11). La tabla `transactions` se
 * crea aquí porque los repositorios de cuentas y categorías la consultan para
 * calcular saldos y bloqueos; SPEC-004 sólo agrega su lógica de negocio.
 */
export const migration = {
  id: '005_auditoria_transacciones',
  up(db) {
    db.exec(`
      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        space_id TEXT REFERENCES spaces(id) ON DELETE RESTRICT,
        user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('create','update','delete','archive','unarchive','refund','archive_from_refund')),
        before_json TEXT,
        after_json TEXT,
        created_at TEXT NOT NULL
      )
    `)
    db.exec('CREATE INDEX idx_audit_space_entity ON audit_log(space_id, entity, entity_id)')
    db.exec('CREATE INDEX idx_audit_created ON audit_log(created_at DESC)')

    db.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
        category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        currency TEXT NOT NULL CHECK (currency IN ('GTQ','USD')),
        fx_rate_micro INTEGER,
        amount_base_cents INTEGER NOT NULL,
        rate_date TEXT,
        rate_source TEXT CHECK (rate_source IN ('base','er-api','banguat','manual')),
        occurred_on TEXT NOT NULL,
        description TEXT NOT NULL,
        notes TEXT,
        transfer_group_id TEXT,
        transfer_direction TEXT CHECK (transfer_direction IN ('in','out')),
        refund_of TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    db.exec('CREATE INDEX idx_transactions_space_occurred ON transactions(space_id, occurred_on)')
    db.exec('CREATE INDEX idx_transactions_space_category ON transactions(space_id, category_id)')
    db.exec('CREATE INDEX idx_transactions_transfer_group ON transactions(transfer_group_id)')
    db.exec('CREATE INDEX idx_transactions_account ON transactions(space_id, account_id)')

    db.exec(`
      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE RESTRICT,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        period_year INTEGER NOT NULL,
        period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
        amount_base_cents INTEGER NOT NULL CHECK (amount_base_cents >= 0),
        currency TEXT NOT NULL DEFAULT 'GTQ' CHECK (currency IN ('GTQ','USD')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (space_id, category_id, period_year, period_month)
      )
    `)
    db.exec('CREATE INDEX idx_budgets_space_period ON budgets(space_id, period_year, period_month)')
  }
}
