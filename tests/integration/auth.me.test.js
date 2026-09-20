/** AC-11 — /api/auth/me expone lo justo. */
import { ok, equal } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

export async function setup(ctx) {
  const server = await startTestServer()
  ctx.server = server
  ctx.owner = await server.createOwner({ email: 'dueno@example.com', name: 'Dueño', password: PASSWORD })
  const login = await server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  ctx.token = cookieValue(login.setCookie, server.config.sessionCookieName)
  ok(ctx.token, 'AC-11: precondición: hay sesión activa')
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** AC-11: /api/auth/me devuelve datos básicos, sin campos sensibles. */
export async function meReturnsPublicData(ctx) {
  const { status, json } = await ctx.server.request('GET', '/api/auth/me', undefined, {
    headers: { Cookie: `${ctx.server.config.sessionCookieName}=${ctx.token}` }
  })
  equal(status, 200, 'AC-11: con sesión responde 200')
  equal(json.id, ctx.owner.id)
  equal(json.email, 'dueno@example.com')
  equal(json.name, 'Dueño')
  equal(json.baseCurrency, 'GTQ')
  equal(json.timezone, 'America/Guatemala')
  ok(!('passwordHash' in json), 'AC-11: sin passwordHash')
  ok(!('passwordSalt' in json), 'AC-11: sin passwordSalt')
  ok(!('password' in json), 'AC-11: sin password')
}
