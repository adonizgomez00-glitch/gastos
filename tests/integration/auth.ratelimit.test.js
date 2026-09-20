/** AC-04 — límite de intentos de login (5 por ventana). */
import { equal } from '../helpers/assert.js'
import { startTestServer } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

export async function setup(ctx) {
  const server = await startTestServer()
  ctx.server = server
  await server.createOwner({ email: 'dueno@example.com', name: 'Dueño', password: PASSWORD })
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** AC-04: el 6.º intento falla con 429 aunque la contraseña sea correcta. */
export async function blocksAfterMaxAttempts(ctx) {
  const wrong = { email: 'dueno@example.com', password: 'contraseña-muy-mala-pero-larga' }
  for (let i = 0; i < 5; i += 1) {
    const attempt = await ctx.server.request('POST', '/api/auth/login', wrong)
    equal(attempt.status, 401, `AC-04: intento ${i + 1} responde 401`)
  }
  const right = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  equal(right.status, 429, 'AC-04: el 6.º intento responde 429 aunque la contraseña sea correcta')
  equal(right.json.code, 'TOO_MANY_ATTEMPTS')
}
