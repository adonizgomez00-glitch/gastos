/** AC-09 — la contraseña nunca queda en claro. */
import { ok } from '../helpers/assert.js'
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

/** AC-09a: en la base de datos solo hay hash y salt, nunca la contraseña. */
export async function storesHashOnly(ctx) {
  const row = ctx.server.db.prepare('SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?').get(ctx.owner.id)
  ok(row.password_hash.length >= 128, 'AC-09: hay un hash largo, no la contraseña')
  ok(row.password_salt.length >= 64, 'AC-09: hay un salt de 32 bytes')
  ok(!row.password_hash.includes('quetzal'), 'AC-09: el hash no contiene la contraseña')
  const leaked = ctx.server.db.prepare("SELECT COUNT(*) AS total FROM users WHERE password_hash LIKE '%quetzal%'").get().total
  ok(leaked === 0, 'AC-09: ninguna fila contiene la contraseña en claro')
}

/** AC-09b: cada alta genera un salt distinto aunque la contraseña sea la misma. */
export async function uniqueSalt(ctx) {
  const second = await ctx.server.createOwner({ email: 'segundo@example.com', password: PASSWORD })
  const row = ctx.server.db.prepare('SELECT password_hash, password_salt FROM users WHERE id IN (?, ?) ORDER BY email').all(ctx.owner.id, second.id)
  ok(row[0].password_salt !== row[1].password_salt, 'AC-09: salts distintos para la misma contraseña')
  ok(row[0].password_hash !== row[1].password_hash, 'AC-09: hashes distintos para la misma contraseña')
}

/** AC-09c: ni la contraseña ni el hash aparecen en los logs. */
export async function passwordNeverLogged(ctx) {
  await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: PASSWORD })
  await ctx.server.request('POST', '/api/auth/login', { email: 'dueno@example.com', password: 'intento-incorrecto-123' })
  const all = ctx.server.lines.join('\\n')
  ok(!all.includes(PASSWORD), 'AC-09: la contraseña correcta no aparece en los logs')
  ok(!all.includes('intento-incorrecto-123'), 'AC-09: la contraseña incorrecta no aparece en los logs')
  ok(!all.includes('quetzal'), 'AC-09: ni siquiera fragmentos de la contraseña aparecen en los logs')
}
