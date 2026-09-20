/** Aserciones mínimas del runner (sin dependencias). */
import assert from 'node:assert/strict'

export { assert }

/** Falla si el valor es falso. @param {unknown} value @param {string} [message] */
export function ok(value, message = 'se esperaba un valor verdadero') {
  assert.ok(value, message)
}

/** Compara con igualdad estricta. @param {unknown} actual @param {unknown} expected @param {string} [message] */
export function equal(actual, expected, message) {
  assert.strictEqual(actual, expected, message)
}

/** Falla si la promesa se resuelve. @param {Function} fn @param {string} [message] */
export async function rejects(fn, message = 'se esperaba un rechazo') {
  let threw = false
  try {
    await fn()
  } catch {
    threw = true
  }
  assert.ok(threw, message)
}
