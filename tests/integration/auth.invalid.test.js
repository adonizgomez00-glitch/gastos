/** AC-02, AC-03, AC-14, AC-15 — credenciales inválidas sin filtrar información. */
import { ok, equal } from '../helpers/assert.js'
import { startTestServer } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

export async function setup(ctx) {
  const server = await startTestServer()
  ctx.server = server
  ctx.owner = await server.createOwner({ email: 'dueno@example.com', name: 'Dueño', password: PASSWORD })
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** AC-02: contraseña incorrecta devuelve 401 genérico, sin cookie. */
export async function wrongPassword(ctx) {
  const { status, json, setCookie } = await ctx.server.request('POST', '/api/auth/login', {
    email: 'dueno@example.com',
    password: 'contraseña-muy-mala-pero-larga'
  })
  equal(status, 401, 'AC-02: contraseña incorrecta responde 401')
  equal(json.code, 'INVALID_CREDENTIALS')
  equal(setCookie.length, 0, 'AC-02: no se emite cookie')
}

/** AC-03: email inexistente devuelve EXACTAMENTE lo mismo que la contraseña incorrecta. */
export async function unknownEmail(ctx) {
  const wrong = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: 'contraseña-muy-mala-pero-larga' })
  const unknown = await ctx.server.request('POST', '/api/auth/login', { email: 'nadie@example.com', password: 'contraseña-muy-mala-pero-larga' })
  equal(unknown.status, 401, 'AC-03: email inexistente responde 401')
  equal(JSON.stringify(unknown.json), JSON.stringify(wrong.json), 'AC-03: cuerpo idéntico al de AC-02 (no filtra existencia)')
}

/** AC-14: el email se normaliza (mayúsculas y espacios). */
export async function emailNormalization(ctx) {
  const { status, json } = await ctx.server.request('POST', '/api/auth/login', {
    email: '  DUENO@Example.COM ',
    password: PASSWORD
  })
  equal(status, 200, 'AC-14: email normalizado autentica igual')
  equal(json.id, ctx.owner.id)
}

/** AC-15: usuario desactivado recibe el mismo 401 genérico. */
export async function inactiveUser(ctx) {
  ctx.server.deps.userRepository.setActive(ctx.owner.id, false)
  const { status, json } = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  equal(status, 401, 'AC-15: usuario desactivado responde 401')
  equal(json.code, 'INVALID_CREDENTIALS', 'AC-15: mensaje genérico, no revela el motivo')
}
