import { randomUUID } from 'node:crypto'
import { NotFoundError, ValidationError } from '../utils/errors.js'
import { sanitizeRateMicro } from '../utils/fx.js'

/** Pares soportados en esta iteración (SPEC-008 §8). */
export const SUPPORTED_PAIR = ['GTQ', 'USD']

/** Horas tras las cuales una tasa se considera `stale` (AC-08 de SPEC-001/008). */
export const STALE_HOURS = 24

/**
 * Servicio de tipos de cambio (SPEC-008).
 * Cadena de resolución: override manual vigente → proveedor primario → secundario
 * → carry-forward → rechazo. El `source` grabado es SIEMPRE el origen real
 * (`er-api`/`banguat`/`manual`); el carry-forward conserva la fecha original.
 */
export class RateService {
  /**
   * @param {object} deps dependencias
   * @param {import('../repositories/ExchangeRateRepository.js').ExchangeRateRepository} deps.rateRepository
   * @param {Array<{name: string, fetchRate: Function}>} deps.providers proveedores en orden de prioridad
   * @param {() => Date} [deps.clock] reloj inyectable
   */
  constructor({ rateRepository, providers = [], clock = () => new Date() }) {
    this._rates = rateRepository
    this._providers = providers
    this._clock = clock
  }

  /** @returns {string} fecha de hoy `YYYY-MM-DD` en la zona del negocio */
  today() {
    return this._clock().toISOString().slice(0, 10)
  }

  /**
   * Resuelve la tasa para una fecha y par de monedas.
   * @param {object} input datos
   * @param {string} input.baseCurrency moneda base @param {string} input.quoteCurrency moneda cotizada
   * @param {string} [input.rateDate] fecha deseada (`YYYY-MM-DD`); por defecto hoy
   * @param {boolean} [input.allowFetch] permite consultar proveedores
   * @returns {Promise<object|null>} tasa con `rateMicro`, `rateDate`, `source`, o null si no hay
   * @throws {ValidationError} si el par no es soportado
   */
  async resolve({ baseCurrency, quoteCurrency, rateDate, allowFetch = true }) {
    const base = String(baseCurrency || '').toUpperCase()
    const quote = String(quoteCurrency || '').toUpperCase()
    assertSupportedPair(base, quote)

    if (base === quote) {
      return { rateMicro: 1_000_000, rateDate: rateDate || this.today(), source: 'base', isBase: true }
    }

    const targetDate = rateDate || this.today()

    // 1. Override manual vigente para esa fecha (AC-05, AC-12).
    const manual = this._rates.findManual(targetDate, base, quote)
    if (manual) return manual

    // 2. Proveedor primario y 3. secundario (AC-01, AC-02, AC-09).
    if (allowFetch) {
      for (const provider of this._providers) {
        const fetched = await provider.fetchRate(base, quote)
        const rateMicro = sanitizeRateMicro(fetched?.rateMicro)
        if (!rateMicro) continue // tasa 0/negativa/no numérica: se descarta y se sigue
        return this._rates.upsert({
          id: randomUUID(),
          rateDate: fetched.rateDate || targetDate,
          baseCurrency: base,
          quoteCurrency: quote,
          rateMicro,
          source: provider.name
        })
      }
    }

    // 4. Carry-forward: reutiliza la última tasa conocida conservando su origen y fecha.
    const latest = this._rates.findLatest(base, quote, { maxDate: targetDate })
    if (latest && sanitizeRateMicro(latest.rateMicro)) return latest

    // 5. Sin tasa válida: no se inventa nada (AC-04, AC-10).
    return null
  }

  /**
   * Resuelve la tasa o lanza error de negocio (lo consumen SPEC-004/005/007).
   * @param {object} input mismos parámetros que `resolve`
   * @returns {Promise<object>} tasa válida
   * @throws {ValidationError} `RATE_UNAVAILABLE` si no hay ninguna
   */
  async requireRate(input) {
    const rate = await this.resolve(input)
    if (!rate) {
      const error = new ValidationError(
        `No hay tasa disponible para ${input.baseCurrency}/${input.quoteCurrency}. Registrá una tasa manual o reintentá.`
      )
      error.code = 'RATE_UNAVAILABLE'
      throw error
    }
    return rate
  }
}

/** Valida el par de monedas contra el canónico GTQ/USD. @throws {ValidationError} */
export function assertSupportedPair(base, quote) {
  for (const currency of [base, quote]) {
    if (!SUPPORTED_PAIR.includes(currency)) {
      throw new ValidationError(
        `Moneda no soportada: ${currency}. En esta iteración solo se admite GTQ y USD.`
      )
    }
  }
}

/**
 * Clasifica la frescura de la última tasa (`ok` | `stale` | `missing`).
 * @param {object|null} latest última tasa @param {Date} now instante actual
 * @returns {'ok'|'stale'|'missing'} estado
 */
export function rateFreshness(latest, now = new Date()) {
  if (!latest) return 'missing'
  const ageHours = (now.getTime() - new Date(latest.fetchedAt).getTime()) / 3_600_000
  return ageHours > STALE_HOURS ? 'stale' : 'ok'
}

/** Reexporta el error de recurso no encontrado para consumidores. */
export { NotFoundError }
