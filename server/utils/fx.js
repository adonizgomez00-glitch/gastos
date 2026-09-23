/**
 * fx.js — conversión de moneda con tasa en micro unidades (I-02, I-03).
 * La tasa SIEMPRE se expresa como `1 <base> = X <quote>` y se guarda como
 * entero multiplicado por 1.000.000 (`rate_micro`) para evitar coma flotante.
 */
import { convertCents } from './money.js'

/** Escala de las tasas: micro unidades (tasa × 1.000.000). */
export const RATE_SCALE = 1_000_000

/**
 * Valida y normaliza una tasa en micro unidades.
 * Descarta 0, negativas y no numéricas (AC-09/AC-10 de SPEC-008).
 * @param {unknown} rateMicro tasa candidata
 * @returns {number|null} tasa válida o null si debe descartarse
 */
export function sanitizeRateMicro(rateMicro) {
  const value = typeof rateMicro === 'string' ? Number(rateMicro) : rateMicro
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (!Number.isInteger(value)) return null
  if (value <= 0) return null
  return value
}

/**
 * Verifica si dos monedas requieren conversión.
 * @param {string} currency moneda del monto
 * @param {string} baseCurrency moneda base
 * @returns {boolean} true si hay que convertir
 */
export function needsConversion(currency, baseCurrency) {
  return String(currency).toUpperCase() !== String(baseCurrency).toUpperCase()
}

/**
 * Convierte un monto a la moneda base usando la tasa congelada.
 * Si no hay conversión, devuelve el mismo monto (la tasa no aplica).
 * @param {object} input datos
 * @param {number} input.amountCents monto en centavos
 * @param {string} input.currency moneda del monto
 * @param {string} input.baseCurrency moneda base
 * @param {number|null} input.rateMicro tasa congelada (obligatoria si hay conversión)
 * @returns {{ amountBaseCents: number, fxRateMicro: number|null }} monto base y tasa usada
 * @throws {Error} si falta la tasa para una conversión necesaria
 */
export function toBaseCents({ amountCents, currency, baseCurrency, rateMicro }) {
  if (!needsConversion(currency, baseCurrency)) {
    return { amountBaseCents: amountCents, fxRateMicro: null }
  }
  const rate = sanitizeRateMicro(rateMicro)
  if (rate === null) {
    const error = new Error('No hay una tasa de cambio válida para convertir el monto')
    error.code = 'RATE_UNAVAILABLE'
    throw error
  }
  return { amountBaseCents: convertCents(amountCents, rate), fxRateMicro: rate }
}

/**
 * Calcula el monto de la pata opuesta de una transferencia entre monedas.
 * @param {number} amountCents monto en la cuenta de origen
 * @param {number} rateMicro tasa `1 origen = X destino` × 1.000.000
 * @returns {number} monto en la cuenta de destino, entero
 */
export function counterpartCents(amountCents, rateMicro) {
  return convertCents(amountCents, rateMicro)
}

/**
 * Convierte micro unidades a número decimal (solo para mostrar/JSON).
 * @param {number} rateMicro tasa en micro unidades
 * @returns {number} tasa decimal
 */
export function rateMicroToDecimal(rateMicro) {
  return rateMicro / RATE_SCALE
}
