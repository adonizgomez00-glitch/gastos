/** AC-01, AC-10, AC-12 — login correcto, rotación de token y purga de vencidas. */
import { ok, equal } from '../helpers/assert.js'
import { startTestServer, cookieValue, cookieHeader } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

/** Registra (arranca) un servidor de prueba con un dueño creado. */
export async function setup(ctx) {
  const server = await startTestServer()
  ctx.server = server
  ctx.owner = await server.createOwner({ email: 'dueno@example.com', name: 'Dueño', password: PASSWORD })
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** AC-01: login correcto devuelve 200, cookie de sesión y usuario sin campos sensibles. */
export async function loginOk(ctx) {
  const { status, json, setCookie } = await ctx.server.request('POST', '/api/auth/login', {
    email: 'dueno@example.com',
    password: PASSWORD
  })
  equal(status, 200, 'AC-01: login correcto responde 200')
  const token = cookieValue(setCookie, ctx.server.config.sessionCookieName)
  ok(token && token.length === 64, 'AC-01: cookie con token de 256 bits')
  const header = cookieHeader(setCookie, ctx.server.config.sessionCookieName)
  ok(header.includes('HttpOnly'), 'AC-01: cookie HttpOnly')
  ok(header.includes('SameSite=Lax'), 'AC-01: cookie SameSite=Lax')
  equal(json.id, ctx.owner.id, 'AC-01: responde el usuario correcto')
  equal(json.email, 'dueno@example.com')
  ok(!('passwordHash' in json) && !('passwordSalt' in json), 'AC-01: sin campos sensibles')
  ctx.token = token
}

/** AC-10: dos logins consecutivos emiten tokens distintos. */
export async function rotatesToken(ctx) {
  const first = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  const second = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  const a = cookieValue(first.setCookie, ctx.server.config.sessionCookieName)
  const b = cookieValue(second.setCookie, ctx.server.config.sessionCookieName)
  ok(a !== b, 'AC-10: los tokens de dos logins consecutivos son distintos')
}

/** AC-12: las sesiones vencidas se purgan al iniciar y en cada login exitoso. */
export async function purgesExpired(ctx) {
  const past = new Date(Date.now() - 60_000).toISOString()
  ctx.server.db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run('token-vencido-1', ctx.owner.id, past, past)
  ctx.server.db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run('token-vencido-2', ctx.owner.id, past, past)
  const before = ctx.server.db.prepare('SELECT COUNT(*) AS total FROM sessions').get().total
  ok(before >= 2, 'AC-12: precondición: hay sesiones vencidas')
  const { status } = await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  equal(status, 200)
  const stale = ctx.server.db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE token LIKE 'token-vencido-%'").get().total
  equal(stale, 0, 'AC-12: las sesiones vencidas se purgaron en el login')
}
