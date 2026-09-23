/**
 * money.js — aritmética monetaria en centavos enteros (I-01).
 * Regla: NUNCA coma flotante. Todo monto es un entero de centavos.
 * Redondeo half-up (lejos de cero en .5) para conversiones y prorrateos.
 */

/** Monedas soportadas en esta iteración (AGENT.md §6.1). */
export const SUPPORTED_CURRENCIES = ['GTQ', 'USD']

/** Moneda base por defecto del proyecto. */
export const BASE_CURRENCY = 'GTQ'

/**
 * Normaliza y valida una moneda.
 * @param {string} currency código de moneda
 * @returns {string} código en mayúsculas
 * @throws {Error} si no es soportada
 */
export function assertCurrency(currency) {
  const code = String(currency || '').trim().toUpperCase()
  if (!SUPPORTED_CURRENCIES.includes(code)) {
    const error = new Error(`Moneda no soportada: ${currency}. Solo se admite ${SUPPORTED_CURRENCIES.join(' o ')}.`)
    error.code = 'UNSUPPORTED_CURRENCY'
    throw error
  }
  return code
}

/**
 * Valida que un valor sea un entero de centavos.
 * Rechaza strings, floats y NaN (AC-12 de SPEC-006: `500.50` debe fallar).
 * @param {unknown} value valor a validar
 * @param {object} [options] `allowNegative`
 * @returns {number} entero de centavos
 * @throws {Error} si no es un entero válido
 */
export function assertCents(value, { allowNegative = true } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    const error = new Error('El monto debe ser un número entero de centavos')
    error.code = 'INVALID_AMOUNT'
    throw error
  }
  if (!allowNegative && value < 0) {
    const error = new Error('El monto no puede ser negativo')
    error.code = 'INVALID_AMOUNT'
    throw error
  }
  return value
}

/**
 * Convierte un monto a la moneda base usando una tasa en micro unidades (I-02).
 * Fórmula: round_half_up(amountCents * rateMicro / 1_000_000).
 * @param {number} amountCents monto en centavos
 * @param {number} rateMicro tasa × 1.000.000
 * @returns {number} monto convertido en centavos, entero
 */
export function convertCents(amountCents, rateMicro) {
  assertCents(amountCents)
  if (!Number.isInteger(rateMicro) || rateMicro <= 0) {
    const error = new Error('La tasa debe ser un entero positivo en micro unidades')
    error.code = 'INVALID_RATE'
    throw error
  }
  return divideRoundHalfUp(amountCents * rateMicro, 1_000_000)
}

/**
 * División entera con redondeo half-up (lejos de cero en .5).
 * @param {number} numerator numerador entero
 * @param {number} denominator denominador entero positivo
 * @returns {number} cociente entero redondeado
 */
export function divideRoundHalfUp(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    const error = new Error('División inválida para redondeo half-up')
    error.code = 'INVALID_AMOUNT'
    throw error
  }
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  const quotient = Math.floor(abs / denominator)
  const remainder = abs - quotient * denominator
  return sign * (remainder * 2 >= denominator ? quotient + 1 : quotient)
}

/**
 * Suma una lista de montos en centavos sin perder precisión.
 * @param {number[]} amounts montos
 * @returns {number} total entero
 */
export function sumCents(amounts) {
  return amounts.reduce((total, value) => total + assertCents(value), 0)
}

/**
 * Formatea centavos para mostrar en la UI (es-GT).
 * @param {number} cents centavos
 * @param {string} [currency] moneda
 * @returns {string} texto formateado
 */
export function formatCents(cents, currency = BASE_CURRENCY) {
  const code = assertCurrency(currency)
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: code }).format(cents / 100)
}
