/**
 * SPEC-005 — Transferencias entre cuentas.
 * Cubre AC-01..AC-15. Un test por criterio de aceptación (AGENT.md §14.1).
 * Los proveedores se inyectan con dobles: la suite NUNCA toca la red (AGENT.md §11.2).
 *
 * AC-02: la spec fue corregida (2026-09-22) de 385153 a 38515 — half-up de
 * 5000 × 7.703054 = 38515.27 → 38515, coherente con §5.1 y §5.3.
 */
import { equal, ok } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'
const RATE = { rateMicro: 7703054, rateDate: '2026-09-21', source: 'er-api' }
/** $50 × 7.703054 = Q385.1527 → 38515 centavos (half-up, I-02). */
const BASE_FROM_50_USD = 38515

/** Proveedor doble que responde o falla a voluntad. */
function fakeProvider(name, result) {
  return { name, fetchRate: async () => result }
}

function clearRates(ctx) {
  ctx.server.deps.exchangeRateRepository._db.prepare('DELETE FROM exchange_rates').run()
}

/** Vacía las transacciones del espacio (rompe antes la FK `refund_of`). */
function clearSpaceTransactions(ctx) {
  ctx.server.db.prepare(
    'UPDATE transactions SET refund_of = NULL WHERE space_id = ?'
  ).run(ctx.owner.spaceId)
  ctx.server.db.prepare('DELETE FROM transactions WHERE space_id = ?').run(ctx.owner.spaceId)
}

export async function setup(ctx) {
  ctx.server = await startTestServer()
  ctx.owner = await ctx.server.createOwner()
  const login = await ctx.server.request('POST', '/api/auth/login', {
    email: ctx.owner.email, password: PASSWORD
  })
  ctx.cookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`

  const accountGtq = await ctx.server.request('POST', '/api/accounts', {
    name: 'Efectivo GTQ', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  ctx.accountGtq = accountGtq.json

  const accountGtq2 = await ctx.server.request('POST', '/api/accounts', {
    name: 'Débito GTQ', type: 'debit', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  ctx.accountGtq2 = accountGtq2.json

  const accountUsd = await ctx.server.request('POST', '/api/accounts', {
    name: 'Débito USD', type: 'debit', currency: 'USD'
  }, { cookie: ctx.cookie })
  ctx.accountUsd = accountUsd.json

  ctx.RATE = { ...RATE }
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
}

export async function teardown(ctx) {
  await ctx.server?.close()
}

/** Crea una transferencia con valores por defecto sobrescribibles. */
async function createTransfer(ctx, overrides = {}) {
  const body = {
    fromAccountId: ctx.accountGtq.id,
    toAccountId: ctx.accountGtq2.id,
    amountCents: 5000,
    currency: 'GTQ',
    occurredOn: '2026-09-21',
    note: 'Pago',
    ...overrides
  }
  return ctx.server.request('POST', '/api/transfers', body, { cookie: ctx.cookie })
}

/** AC-01: transferencia GTQ → GTQ crea dos patas enlazadas sin tasa. */
export async function transferGtqToGtq(ctx) {
  clearSpaceTransactions(ctx)
  const res = await createTransfer(ctx)
  equal(res.status, 201, 'AC-01: debe responder 201')
  equal(res.json.legs.length, 2, 'AC-01: exactamente dos patas')
  ok(res.json.transferGroupId, 'AC-01: hay transferGroupId compartido')

  const [out, inn] = res.json.legs
  equal(out.kind, 'transfer')
  equal(inn.kind, 'transfer')
  equal(out.amountCents, 5000)
  equal(inn.amountCents, 5000)
  equal(out.currency, 'GTQ')
  equal(inn.currency, 'GTQ')
  equal(out.amountBaseCents, 5000, 'AC-01: sin conversión el monto base es igual')
  equal(inn.amountBaseCents, 5000)
  equal(out.transferGroupId, res.json.transferGroupId)
  equal(inn.transferGroupId, res.json.transferGroupId)
  equal(out.fxRateMicro, null, 'AC-01: misma moneda GTQ no consulta tasa')
  equal(inn.fxRateMicro, null)
  equal(out.rateSource, null)
  equal(out.rateDate, null)
}

/** AC-02: transferencia USD → GTQ con conversión half-up congelada. */
export async function transferUsdToGtqConverts(ctx) {
  clearSpaceTransactions(ctx)
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]

  const res = await createTransfer(ctx, {
    fromAccountId: ctx.accountUsd.id,
    toAccountId: ctx.accountGtq.id,
    amountCents: 5000,
    currency: 'USD',
    note: 'Remesa'
  })
  equal(res.status, 201, 'AC-02: debe responder 201')
  const [out, inn] = res.json.legs

  equal(out.accountId, ctx.accountUsd.id, 'AC-02: pata origen es la cuenta USD')
  equal(out.amountCents, 5000)
  equal(out.currency, 'USD')
  equal(out.amountBaseCents, BASE_FROM_50_USD, 'AC-02: half-up de 5000 × 7.703054')
  equal(out.fxRateMicro, 7703054, 'AC-02: congela la tasa usada')

  equal(inn.accountId, ctx.accountGtq.id, 'AC-02: pata destino es la cuenta GTQ')
  equal(inn.amountCents, BASE_FROM_50_USD, 'AC-02: destino recibe el valor en GTQ')
  equal(inn.currency, 'GTQ')
  equal(inn.amountBaseCents, BASE_FROM_50_USD, 'AC-02: mismo amount_base_cents (I-04)')
  equal(inn.fxRateMicro, 7703054)

  equal(out.transferGroupId, inn.transferGroupId, 'AC-02: mismo transferGroupId')
  equal(out.rateDate, inn.rateDate, 'AC-02: misma rateDate')
  equal(out.rateSource, inn.rateSource, 'AC-02: misma rateSource')
  equal(out.rateSource, 'er-api')
  equal(out.rateDate, '2026-09-21')
}

/** AC-03: la transferencia no suma a gastos ni ingresos (I-04). */
export async function transferDoesNotSumToExpenseIncome(ctx) {
  clearSpaceTransactions(ctx)
  const category = await ctx.server.request('POST', '/api/categories', {
    name: 'Comida T', kind: 'expense'
  }, { cookie: ctx.cookie })

  const expense = await ctx.server.request('POST', '/api/transactions', {
    kind: 'expense',
    accountId: ctx.accountGtq.id,
    categoryId: category.json.id,
    amountCents: 2000,
    currency: 'GTQ',
    occurredOn: '2026-09-21',
    description: 'Gasto real'
  }, { cookie: ctx.cookie })
  equal(expense.status, 201)

  const transfer = await createTransfer(ctx, { amountCents: 9000 })
  equal(transfer.status, 201)

  const summary = ctx.server.deps.transactionService.sumByCategory(ctx.owner.spaceId, 2026, 9)
  equal(summary.total, 2000, 'AC-03: el total del mes solo incluye el gasto')

  const list = await ctx.server.request(
    'GET', '/api/transactions?kind=expense&from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  equal(list.json.transactions.length, 1, 'AC-03: kind=expense excluye la transferencia')
  ok(!list.json.transactions.some((txn) => txn.kind === 'transfer'),
    'AC-03: ninguna pata aparece como gasto')

  const incomeList = await ctx.server.request(
    'GET', '/api/transactions?kind=income&from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  equal(incomeList.json.transactions.length, 0, 'AC-03: la transferencia no es ingreso')
}

/** AC-04: ambas patas conservan el mismo amount_base_cents (I-04). */
export async function bothLegsShareAmountBase(ctx) {
  clearSpaceTransactions(ctx)
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]

  const res = await createTransfer(ctx, {
    fromAccountId: ctx.accountUsd.id,
    toAccountId: ctx.accountGtq.id,
    amountCents: 1234,
    currency: 'USD'
  })
  equal(res.status, 201)
  const [out, inn] = res.json.legs
  equal(out.amountBaseCents, inn.amountBaseCents, 'AC-04: amount_base_cents idéntico en ambas patas')
  // 1234 × 7.703054 = 9505.568636 → half-up 9506
  equal(out.amountBaseCents, 9506, 'AC-04: conversión half-up del monto origen')
}

/** AC-05: transferir a la misma cuenta → 422 SAME_ACCOUNT. */
export async function rejectSameAccount(ctx) {
  const res = await createTransfer(ctx, {
    fromAccountId: ctx.accountGtq.id,
    toAccountId: ctx.accountGtq.id
  })
  equal(res.status, 422, 'AC-05: debe rechazar con 422')
  equal(res.json.code, 'SAME_ACCOUNT')
}

/** AC-06: cuenta de otro espacio → 404 (no filtra existencia, I-07). */
export async function rejectOtherSpaceAccount(ctx) {
  const other = await ctx.server.createOwner()
  const login = await ctx.server.request('POST', '/api/auth/login', {
    email: other.email, password: PASSWORD
  })
  const otherCookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`
  const otherAccount = await ctx.server.request('POST', '/api/accounts', {
    name: 'Ajena', type: 'cash', currency: 'GTQ'
  }, { cookie: otherCookie })
  equal(otherAccount.status, 201)

  const res = await createTransfer(ctx, { toAccountId: otherAccount.json.id })
  equal(res.status, 404, 'AC-06: no filtra existencia; responde 404')
  equal(res.json.code, 'NOT_FOUND')
}

/** AC-07: monto cero → 422 INVALID_AMOUNT (I-08). */
export async function rejectZeroAmount(ctx) {
  const res = await createTransfer(ctx, { amountCents: 0 })
  equal(res.status, 422, 'AC-07: debe rechazar con 422')
  equal(res.json.code, 'INVALID_AMOUNT')
}

/** AC-08: cuenta archivada en origen o destino → 422 ACCOUNT_ARCHIVED. */
export async function rejectArchivedAccount(ctx) {
  const created = await ctx.server.request('POST', '/api/accounts', {
    name: 'Para archivar AC-08', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  await ctx.server.request('POST', `/api/accounts/${created.json.id}/archive`, {},
    { cookie: ctx.cookie })

  const toArchived = await createTransfer(ctx, { toAccountId: created.json.id })
  equal(toArchived.status, 422, 'AC-08: destino archivado → 422')
  equal(toArchived.json.code, 'ACCOUNT_ARCHIVED')

  const fromArchived = await createTransfer(ctx, { fromAccountId: created.json.id })
  equal(fromArchived.status, 422, 'AC-08: origen archivado → 422')
  equal(fromArchived.json.code, 'ACCOUNT_ARCHIVED')
}

/** AC-09: la tasa congelada no cambia aunque la vigente cambie (I-03). */
export async function frozenRateDoesNotChange(ctx) {
  clearSpaceTransactions(ctx)
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]

  const created = await createTransfer(ctx, {
    fromAccountId: ctx.accountUsd.id,
    toAccountId: ctx.accountGtq.id,
    amountCents: 500,
    currency: 'USD'
  })
  equal(created.status, 201)
  equal(created.json.legs[0].fxRateMicro, 7703054)

  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-nueva-ac09',
    rateDate: '2026-09-22',
    baseCurrency: 'USD',
    quoteCurrency: 'GTQ',
    rateMicro: 9_000_000,
    source: 'er-api',
    fetchedAt: '2026-09-22T12:00:00.000Z'
  })
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', {
    rateMicro: 9_000_000, rateDate: '2026-09-22', source: 'er-api'
  })]

  const list = await ctx.server.request('GET', '/api/transfers',
    undefined, { cookie: ctx.cookie })
  equal(list.status, 200, 'AC-09: debe listar transferencias')
  const group = list.json.transfers.find(
    (t) => t.transferGroupId === created.json.transferGroupId
  )
  ok(group, 'AC-09: la transferencia sigue en la lista')
  equal(group.legs[0].fxRateMicro, 7703054, 'AC-09: conserva la tasa original (I-03)')
  equal(group.legs[0].amountBaseCents, 3852, 'AC-09: el monto base no se recalcula')
  equal(group.legs[1].amountBaseCents, 3852, 'AC-09: ambas patas congeladas')
}

/** AC-10: sin tasa para monedas distintas → 422 RATE_UNAVAILABLE. */
export async function rejectRateUnavailable(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [
    fakeProvider('er-api', null),
    fakeProvider('banguat', null)
  ]
  const res = await createTransfer(ctx, {
    fromAccountId: ctx.accountUsd.id,
    toAccountId: ctx.accountGtq.id,
    amountCents: 500,
    currency: 'USD'
  })
  equal(res.status, 422, 'AC-10: debe rechazar con 422')
  equal(res.json.code, 'RATE_UNAVAILABLE', 'AC-10: nunca inventa una tasa')
}

/** AC-11: GET /api/transfers agrupa por transferGroupId con filtros from/to. */
export async function listTransfersGrouped(ctx) {
  clearSpaceTransactions(ctx)
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]

  const t1 = await createTransfer(ctx, {
    amountCents: 1000, occurredOn: '2026-09-10', note: 'T1'
  })
  const t2 = await createTransfer(ctx, {
    amountCents: 2000, occurredOn: '2026-09-20', note: 'T2'
  })
  equal(t1.status, 201)
  equal(t2.status, 201)

  const res = await ctx.server.request(
    'GET', '/api/transfers?from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  equal(res.status, 200, 'AC-11: responde 200')
  equal(res.json.transfers.length, 2, 'AC-11: dos transferencias en septiembre')

  for (const group of res.json.transfers) {
    equal(group.legs.length, 2, 'AC-11: cada grupo tiene dos patas')
    ok(group.transferGroupId, 'AC-11: cada grupo expone transferGroupId')
  }

  const ids = res.json.transfers.map((g) => g.transferGroupId).sort()
  const expected = [t1.json.transferGroupId, t2.json.transferGroupId].sort()
  equal(JSON.stringify(ids), JSON.stringify(expected), 'AC-11: los ids coinciden')

  const outside = await ctx.server.request(
    'GET', '/api/transfers?from=2026-10-01&to=2026-10-31',
    undefined, { cookie: ctx.cookie }
  )
  equal(outside.json.transfers.length, 0, 'AC-11: from/to acotan el rango')
}

/** AC-12: DELETE borra ambas patas en una sola transacción. */
export async function deleteTransferRemovesBothLegs(ctx) {
  clearSpaceTransactions(ctx)
  const created = await createTransfer(ctx, { amountCents: 7500, note: 'Para borrar' })
  equal(created.status, 201)
  const groupId = created.json.transferGroupId

  const before = ctx.server.db.prepare(
    'SELECT COUNT(*) AS total FROM transactions WHERE transfer_group_id = ?'
  ).get(groupId)
  equal(Number(before.total), 2, 'AC-12: hay dos patas antes de borrar')

  const deleted = await ctx.server.request('DELETE', `/api/transfers/${groupId}`,
    undefined, { cookie: ctx.cookie })
  equal(deleted.status, 200, 'AC-12: debe responder 200')
  equal(deleted.json.deleted, true)
  equal(deleted.json.legsRemoved, 2, 'AC-12: borró exactamente dos filas')

  const after = ctx.server.db.prepare(
    'SELECT COUNT(*) AS total FROM transactions WHERE transfer_group_id = ?'
  ).get(groupId)
  equal(Number(after.total), 0, 'AC-12: ambas patas desaparecieron')

  const list = await ctx.server.request('GET', '/api/transfers',
    undefined, { cookie: ctx.cookie })
  ok(!list.json.transfers.some((g) => g.transferGroupId === groupId),
    'AC-12: la transferencia ya no aparece en la lista')

  const missing = await ctx.server.request('DELETE', `/api/transfers/${groupId}`,
    undefined, { cookie: ctx.cookie })
  equal(missing.status, 404, 'AC-12: borrar dos veces responde 404')
}

/** AC-13: carry-forward conserva el origen real y la fecha original. */
export async function carryForwardKeepsRealSource(ctx) {
  clearSpaceTransactions(ctx)
  clearRates(ctx)
  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-cf-ac13',
    rateDate: '2026-09-18',
    baseCurrency: 'USD',
    quoteCurrency: 'GTQ',
    rateMicro: 7_600_000,
    source: 'er-api',
    fetchedAt: '2026-09-18T12:00:00.000Z'
  })
  ctx.server.deps.rateService._providers = [
    fakeProvider('er-api', null),
    fakeProvider('banguat', null)
  ]

  const res = await createTransfer(ctx, {
    fromAccountId: ctx.accountUsd.id,
    toAccountId: ctx.accountGtq.id,
    amountCents: 100,
    currency: 'USD',
    occurredOn: '2026-09-21'
  })
  equal(res.status, 201, 'AC-13: se registra con carry-forward')
  const [out, inn] = res.json.legs
  equal(out.rateSource, 'er-api', 'AC-13: conserva el origen real, no "carry-forward"')
  equal(out.rateDate, '2026-09-18', 'AC-13: conserva la fecha original')
  equal(inn.rateSource, 'er-api', 'AC-13: ambas patas con el mismo origen')
  equal(inn.rateDate, '2026-09-18')
  equal(out.amountBaseCents, 760, 'AC-13: 100 × 7.6 = 760')
  equal(inn.amountBaseCents, 760, 'AC-13: mismo amount_base en ambas patas')
}

/** AC-14: category_id siempre NULL en ambas patas. */
export async function categoryIdAlwaysNull(ctx) {
  clearSpaceTransactions(ctx)
  const res = await createTransfer(ctx)
  equal(res.status, 201)
  equal(res.json.legs[0].categoryId, null, 'AC-14: pata origen sin categoría')
  equal(res.json.legs[1].categoryId, null, 'AC-14: pata destino sin categoría')
}

/** AC-15: aislamiento por espacio — solo ve transferencias propias (I-07). */
export async function isolationBySpace(ctx) {
  clearSpaceTransactions(ctx)

  const other = await ctx.server.createOwner()
  const login = await ctx.server.request('POST', '/api/auth/login', {
    email: other.email, password: PASSWORD
  })
  const otherCookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`

  const a1 = await ctx.server.request('POST', '/api/accounts', {
    name: 'Ajena 1', type: 'cash', currency: 'GTQ'
  }, { cookie: otherCookie })
  const a2 = await ctx.server.request('POST', '/api/accounts', {
    name: 'Ajena 2', type: 'cash', currency: 'GTQ'
  }, { cookie: otherCookie })
  const otherTransfer = await ctx.server.request('POST', '/api/transfers', {
    fromAccountId: a1.json.id,
    toAccountId: a2.json.id,
    amountCents: 999,
    currency: 'GTQ',
    occurredOn: '2026-09-21'
  }, { cookie: otherCookie })
  equal(otherTransfer.status, 201, 'AC-15: el otro espacio sí crea su transferencia')

  const mine = await createTransfer(ctx, { amountCents: 111 })
  equal(mine.status, 201)

  const list = await ctx.server.request('GET', '/api/transfers',
    undefined, { cookie: ctx.cookie })
  equal(list.status, 200)
  ok(!list.json.transfers.some(
    (g) => g.transferGroupId === otherTransfer.json.transferGroupId
  ), 'AC-15: la transferencia ajena no aparece en el listado')

  const del = await ctx.server.request(
    'DELETE', `/api/transfers/${otherTransfer.json.transferGroupId}`,
    undefined, { cookie: ctx.cookie }
  )
  equal(del.status, 404, 'AC-15: DELETE de otra espacio responde 404, no 403')
  equal(del.json.code, 'NOT_FOUND')
}
