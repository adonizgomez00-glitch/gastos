/**
 * SPEC-002 — Cuentas (efectivo, débito, crédito).
 * Cubre AC-01..AC-10. Un test por criterio de aceptación (AGENT.md §14.1).
 */
import { equal, ok } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'

export async function setup(ctx) {
  ctx.server = await startTestServer()
  const owner = await ctx.server.createOwner()
  ctx.owner = owner
  const login = await ctx.server.request('POST', '/api/auth/login', { email: owner.email, password: PASSWORD })
  ctx.cookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`
}

export async function teardown(ctx) {
  await ctx.server?.close()
}

/** AC-01: crear cuenta efectivo en GTQ queda registrada con el espacio del dueño. */
export async function createCashAccountGtq(ctx) {
  const res = await ctx.server.request('POST', '/api/accounts', {
    name: 'Efectivo GTQ', type: 'cash', currency: 'GTQ', openingBalanceCents: 50000
  }, { cookie: ctx.cookie })
  equal(res.status, 201, 'AC-01: debe responder 201')
  equal(res.json.type, 'cash')
  equal(res.json.currency, 'GTQ')
  equal(res.json.openingBalanceCents, 50000)
  ok(res.json.id, 'AC-01: debe tener id')
}

/** AC-02: crear cuenta débito en USD. */
export async function createDebitAccountUsd(ctx) {
  const res = await ctx.server.request('POST', '/api/accounts', {
    name: 'Débito USD', type: 'debit', currency: 'USD'
  }, { cookie: ctx.cookie })
  equal(res.status, 201, 'AC-02: debe responder 201')
  equal(res.json.currency, 'USD')
  equal(res.json.openingBalanceCents, 0, 'AC-02: saldo inicial por defecto es 0')
}

/** AC-03: cuenta crédito acepta saldo inicial negativo. */
export async function creditAllowsNegativeOpening(ctx) {
  const res = await ctx.server.request('POST', '/api/accounts', {
    name: 'Tarjeta crédito USD', type: 'credit', currency: 'USD', openingBalanceCents: -20000
  }, { cookie: ctx.cookie })
  equal(res.status, 201, 'AC-03: el crédito admite saldo negativo')
  equal(res.json.openingBalanceCents, -20000)
}

/** AC-04: rechazar saldo inicial negativo en efectivo. */
export async function cashRejectsNegativeOpening(ctx) {
  const res = await ctx.server.request('POST', '/api/accounts', {
    name: 'Efectivo negativo', type: 'cash', currency: 'GTQ', openingBalanceCents: -100
  }, { cookie: ctx.cookie })
  equal(res.status, 422, 'AC-04: debe rechazar con 422')
  equal(res.json.code, 'VALIDATION_ERROR')
}

/** AC-05: consultar cuentas del espacio devuelve la lista con saldo calculado. */
export async function listAccountsWithBalance(ctx) {
  await ctx.server.request('POST', '/api/accounts', {
    name: 'Ahorro GTQ', type: 'debit', currency: 'GTQ', openingBalanceCents: 123456
  }, { cookie: ctx.cookie })
  const res = await ctx.server.request('GET', '/api/accounts', undefined, { cookie: ctx.cookie })
  equal(res.status, 200, 'AC-05: debe responder 200')
  const found = res.json.accounts.find((account) => account.name === 'Ahorro GTQ')
  ok(found, 'AC-05: la cuenta creada debe aparecer')
  equal(found.balanceCents, 123456, 'AC-05: saldo calculado = inicial + movimientos')
}

/** AC-06: desactivar (archivar) una cuenta la deja inactiva. */
export async function archiveAccountDeactivates(ctx) {
  const created = await ctx.server.request('POST', '/api/accounts', {
    name: 'Para archivar', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  const archived = await ctx.server.request('POST', `/api/accounts/${created.json.id}/archive`, {},
    { cookie: ctx.cookie })
  equal(archived.status, 200, 'AC-06: debe responder 200')
  equal(archived.json.archived, true, 'AC-06: queda inactiva')

  const list = await ctx.server.request('GET', '/api/accounts', undefined, { cookie: ctx.cookie })
  const still = list.json.accounts.find((account) => account.id === created.json.id)
  equal(still, undefined, 'AC-06: la cuenta archivada no aparece en el listado activo')
}

/** AC-07: no se elimina una cuenta con transacciones (la API no expone DELETE). */
export async function deleteAccountWithTransactionsRejected(ctx) {
  const created = await ctx.server.request('POST', '/api/accounts', {
    name: 'Con movimientos', type: 'debit', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  // Movimiento directo para probar el bloqueo sin depender de SPEC-004.
  const now = new Date().toISOString()
  ctx.server.db.prepare(
    `INSERT INTO transactions (id, space_id, account_id, kind, amount_cents, currency,
       amount_base_cents, occurred_on, description, created_at, updated_at)
     VALUES ('tx-ac07', ?, ?, 'expense', 1000, 'GTQ', 1000, '2026-09-21', 'Prueba AC-07', ?, ?)`
  ).run(ctx.owner.spaceId, created.json.id, now, now)

  const res = await ctx.server.request('DELETE', `/api/accounts/${created.json.id}`, undefined,
    { cookie: ctx.cookie })
  equal(res.status, 405, 'AC-07: eliminar una cuenta no está permitido (sólo archivar)')

  const detail = await ctx.server.request('GET', `/api/accounts/${created.json.id}`, undefined,
    { cookie: ctx.cookie })
  equal(detail.status, 200, 'AC-07: la cuenta sigue existiendo (no se borró)')
}

/** AC-08: moneda no soportada se rechaza. */
export async function unsupportedCurrencyRejected(ctx) {
  const res = await ctx.server.request('POST', '/api/accounts', {
    name: 'Cuenta EUR', type: 'cash', currency: 'EUR'
  }, { cookie: ctx.cookie })
  equal(res.status, 422, 'AC-08: debe rechazar 422')
  equal(res.json.code, 'VALIDATION_ERROR')
}

/** AC-09: no se admite movimiento en una cuenta inexistente. */
export async function unknownAccountRejected(ctx) {
  let error = null
  try {
    ctx.server.deps.accountService.assertUsable(ctx.owner.spaceId, 'cuenta-que-no-existe')
  } catch (caught) {
    error = caught
  }
  ok(error, 'AC-09: debe lanzar error')
  equal(error.status, 404, 'AC-09: cuenta inexistente → 404')
}

/** AC-10: no se admite movimiento en una cuenta inactiva. */
export async function archivedAccountRejected(ctx) {
  const created = await ctx.server.request('POST', '/api/accounts', {
    name: 'Inactiva AC-10', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  await ctx.server.request('POST', `/api/accounts/${created.json.id}/archive`, {}, { cookie: ctx.cookie })

  let error = null
  try {
    ctx.server.deps.accountService.assertUsable(ctx.owner.spaceId, created.json.id)
  } catch (caught) {
    error = caught
  }
  ok(error, 'AC-10: debe lanzar error')
  equal(error.status, 409, 'AC-10: cuenta inactiva → 409')
}

