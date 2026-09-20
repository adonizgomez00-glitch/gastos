/** Idempotencia de applyMigrations y forma del esquema fundacional. */
import { ok, equal } from '../helpers/assert.js'
import { startTestServer } from '../helpers/harness.js'
import { applyMigrations } from '../../server/database/applyMigrations.js'
import { MIGRATIONS } from '../../server/database/migrations/index.js'

export async function setup(ctx) {
  const server = await startTestServer()
  ctx.server = server
}

export async function teardown(ctx) {
  await ctx.server.close()
}

/** Re-ejecutar migraciones no aplica nada nuevo. */
export async function idempotent(ctx) {
  const again = applyMigrations(ctx.server.db, MIGRATIONS)
  equal(again.applied.length, 0, 'segunda ejecución no aplica nada nuevo')
  ok(again.skipped.includes('001_init'), 'la migración inicial queda registrada como aplicada')
}

/** Las tablas fundacionales existen con su forma esperada. */
export async function schemaShape(ctx) {
  const tables = ctx.server.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name)
  for (const expected of ['schema_migrations', 'sessions', 'space_members', 'spaces', 'users']) {
    ok(tables.includes(expected), `tabla presente: ${expected}`)
  }
  const usersCols = ctx.server.db.prepare("PRAGMA table_info('users')").all().map((c) => `${c.name}:${c.type}`)
  for (const expected of ['id:TEXT', 'email:TEXT', 'password_hash:TEXT', 'password_salt:TEXT']) {
    ok(usersCols.includes(expected), `columna presente: ${expected}`)
  }
}
