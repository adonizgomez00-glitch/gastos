/** AC-05, AC-06, AC-07, AC-08 — vida de la sesión.
 * Nota (SPEC-001 §10): /api/transactions llega con SPEC-004; la ruta protegida de prueba es /api/auth/me. */
import { ok, equal } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

/** Reloj mutable para simular el paso del tiempo (AC-07). */
export async function setup(ctx) {
  const holder = { now: new Date('2026-09-20T10:00:00.000Z') }
  const server = await startTestServer({ clock: () => holder.now })
  ctx.server = server
  ctx.holder = holder
  ctx.owner = await server.createOwner({ email: 'dueno@example.com', name: 'Dueño', password: PASSWORD })
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** AC-05: ruta protegida sin sesión devuelve 401. */
export async function requiresSession(ctx) {
  const { status, json } = await ctx.server.request('GET', '/api/auth/me')
  equal(status, 401, 'AC-05: sin sesión responde 401')
  equal(json.code, 'UNAUTHENTICATED')
}

/** AC-06: token manipulado devuelve 401. */
export async function rejectsForgedToken(ctx) {
  const { status } = await ctx.server.request('GET', '/api/auth/me', undefined, {
    headers: { Cookie: `${ctx.server.config.sessionCookieName}=token-falso-123` }
  })
  equal(status, 401, 'AC-06: token inexistente responde 401')
}

/** AC-07: sesión vencida devuelve 401 y se elimina. */
export async function expiresSession(ctx) {
  const login = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  const token = cookieValue(login.setCookie, ctx.server.config.sessionCookieName)
  ok(token, 'AC-07: precondición: hay sesión activa')
  ctx.holder.now = new Date('2026-09-21T22:01:00.000Z') // 36 h después (TTL: 12 h)
  const expired = await ctx.server.request('GET', '/api/auth/me', undefined, {
    headers: { Cookie: `${ctx.server.config.sessionCookieName}=${token}` }
  })
  equal(expired.status, 401, 'AC-07: sesión vencida responde 401')
  const remaining = ctx.server.db.prepare('SELECT COUNT(*) AS total FROM sessions WHERE token = ?').get(token).total
  equal(remaining, 0, 'AC-07: la sesión vencida se eliminó')
}

/** AC-08: logout revoca el token y su reutilización devuelve 401. */
export async function logoutRevokes(ctx) {
  const login = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  const token = cookieValue(login.setCookie, ctx.server.config.sessionCookieName)
  const out = await ctx.server.request('POST', '/api/auth/logout', undefined, {
    headers: { Cookie: `${ctx.server.config.sessionCookieName}=${token}` }
  })
  equal(out.status, 200, 'AC-08: logout responde 200')
  const reuse = await ctx.server.request('GET', '/api/auth/me', undefined, {
    headers: { Cookie: `${ctx.server.config.sessionCookieName}=${token}` }
  })
  equal(reuse.status, 401, 'AC-08: el token revocado ya no sirve')
}
