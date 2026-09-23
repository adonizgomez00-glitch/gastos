/**
 * Repositorio de tipos de cambio (SPEC-008). Único lugar con SQL de `exchange_rates`.
 * `source` ∈ {er-api, banguat, manual}: el carry-forward NO es un origen grabado.
 */
export class ExchangeRateRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Busca la tasa de una fecha concreta, priorizando manual > er-api > banguat.
   * @param {string} rateDate fecha `YYYY-MM-DD`
   * @param {string} baseCurrency moneda base @param {string} quoteCurrency moneda cotizada
   * @returns {object|null} tasa o null
   */
  findByDate(rateDate, baseCurrency, quoteCurrency) {
    const row = this._db.prepare(
      `SELECT * FROM exchange_rates
        WHERE rate_date = ? AND base_currency = ? AND quote_currency = ?
        ORDER BY CASE source WHEN 'manual' THEN 0 WHEN 'er-api' THEN 1 ELSE 2 END
        LIMIT 1`
    ).get(rateDate, baseCurrency, quoteCurrency)
    return row ? toRate(row) : null
  }

  /**
   * Devuelve la última tasa conocida (carry-forward), conservando su fecha y origen.
   * @param {string} baseCurrency moneda base @param {string} quoteCurrency moneda cotizada
   * @param {{ maxDate?: string }} [options] `maxDate` limita hacia atrás
   * @returns {object|null} tasa más reciente o null
   */
  findLatest(baseCurrency, quoteCurrency, { maxDate } = {}) {
    const sql = maxDate
      ? `SELECT * FROM exchange_rates
          WHERE base_currency = ? AND quote_currency = ? AND rate_date <= ?
          ORDER BY rate_date DESC, CASE source WHEN 'manual' THEN 0 WHEN 'er-api' THEN 1 ELSE 2 END
          LIMIT 1`
      : `SELECT * FROM exchange_rates
          WHERE base_currency = ? AND quote_currency = ?
          ORDER BY rate_date DESC, CASE source WHEN 'manual' THEN 0 WHEN 'er-api' THEN 1 ELSE 2 END
          LIMIT 1`
    const row = maxDate
      ? this._db.prepare(sql).get(baseCurrency, quoteCurrency, maxDate)
      : this._db.prepare(sql).get(baseCurrency, quoteCurrency)
    return row ? toRate(row) : null
  }

  /**
   * Busca la override manual de una fecha (AC-05/AC-12 de SPEC-008).
   * @param {string} rateDate fecha @param {string} baseCurrency base @param {string} quoteCurrency cotizada
   * @returns {object|null} override o null
   */
  findManual(rateDate, baseCurrency, quoteCurrency) {
    const row = this._db.prepare(
      `SELECT * FROM exchange_rates
        WHERE rate_date = ? AND base_currency = ? AND quote_currency = ? AND source = 'manual'`
    ).get(rateDate, baseCurrency, quoteCurrency)
    return row ? toRate(row) : null
  }

  /**
   * Inserta o reemplaza una tasa (UNIQUE por fecha, par y fuente).
   * @param {object} data datos de la tasa
   * @returns {object} tasa guardada
   */
  upsert(data) {
    const now = data.fetchedAt || new Date().toISOString()
    this._db.prepare(
      `INSERT INTO exchange_rates (id, rate_date, base_currency, quote_currency, rate_micro,
                                   source, is_manual, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (rate_date, base_currency, quote_currency, source)
       DO UPDATE SET rate_micro = excluded.rate_micro,
                     is_manual = excluded.is_manual,
                     fetched_at = excluded.fetched_at`
    ).run(
      data.id,
      data.rateDate,
      data.baseCurrency,
      data.quoteCurrency,
      data.rateMicro,
      data.source,
      data.source === 'manual' ? 1 : 0,
      now
    )
    return this.findByDate(data.rateDate, data.baseCurrency, data.quoteCurrency)
  }

  /**
   * Última fecha con tasa registrada (frescura del health, AC-08).
   * @returns {string|null} fecha `YYYY-MM-DD` o null
   */
  latestRateDate() {
    const row = this._db.prepare('SELECT MAX(rate_date) AS last FROM exchange_rates').get()
    return row?.last || null
  }

  /** @returns {number} cantidad de tasas registradas */
  count() {
    return Number(this._db.prepare('SELECT COUNT(*) AS total FROM exchange_rates').get().total)
  }
}

function toRate(row) {
  return {
    id: row.id,
    rateDate: row.rate_date,
    baseCurrency: row.base_currency,
    quoteCurrency: row.quote_currency,
    rateMicro: Number(row.rate_micro),
    source: row.source,
    isManual: Number(row.is_manual) === 1,
    fetchedAt: row.fetched_at
  }
}
