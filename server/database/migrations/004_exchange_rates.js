/**
 * Migración 004 — tipos de cambio (SPEC-008).
 * Schema canónico AGENT.md §6.1. `source` NO incluye carry-forward: esa es una
 * estrategia de resolución, no un origen grabado (ADR-004 / SPEC-008 §11).
 */
export const migration = {
  id: '004_exchange_rates',
  up(db) {
    db.exec(`
      CREATE TABLE exchange_rates (
        id TEXT PRIMARY KEY,
        rate_date TEXT NOT NULL,
        base_currency TEXT NOT NULL CHECK (base_currency IN ('GTQ','USD')),
        quote_currency TEXT NOT NULL CHECK (quote_currency IN ('GTQ','USD')),
        rate_micro INTEGER NOT NULL CHECK (rate_micro > 0),
        source TEXT NOT NULL CHECK (source IN ('er-api','banguat','manual')),
        is_manual INTEGER NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL,
        UNIQUE (rate_date, base_currency, quote_currency, source)
      )
    `)
    db.exec('CREATE INDEX idx_exchange_rates_pair_date ON exchange_rates(base_currency, quote_currency, rate_date DESC)')
  }
}
