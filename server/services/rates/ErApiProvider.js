/**
 * Proveedor primario de cotizaciones: open.er-api.com (ADR-004).
 * Gratuito y sin clave. Devuelve la tasa `1 USD = X GTQ`.
 */
export class ErApiProvider {
  /**
   * @param {object} [options] `fetchImpl` (pruebas), `timeoutMs`
   */
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
    this._fetch = fetchImpl
    this._timeoutMs = timeoutMs
  }

  /** @returns {string} identificador del origen grabado en `rate_source` */
  get name() {
    return 'er-api'
  }

  /**
   * Consulta la tasa de mercado.
   * @param {string} baseCurrency moneda base @param {string} quoteCurrency moneda cotizada
   * @returns {Promise<{rateMicro: number, rateDate: string, source: string}|null>} tasa o null
   */
  async fetchRate(baseCurrency, quoteCurrency) {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`
    try {
      const response = await this._withTimeout(this._fetch(url))
      if (!response.ok) return null
      const payload = await response.json()
      if (payload.result !== 'success') return null
      const rate = Number(payload.rates?.[quoteCurrency])
      if (!Number.isFinite(rate) || rate <= 0) return null
      const rateDate = String(payload.time_last_update_utc || '')
      return {
        rateMicro: Math.round(rate * 1_000_000),
        rateDate: toIsoDate(rateDate) || toIsoDate(new Date()),
        source: this.name
      }
    } catch {
      return null
    }
  }

  /** Aplica el tiempo máximo de espera al proveedor. */
  _withTimeout(promise) {
    if (!this._timeoutMs) return promise
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), this._timeoutMs))
    ])
  }
}

/**
 * Convierte una fecha de proveedor a `YYYY-MM-DD`.
 * @param {string|Date} value fecha original
 * @returns {string|null} fecha ISO corta o null
 */
export function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}
