/**
 * SPEC-004 — Transacciones (gastos e ingresos).
 * Cubre AC-01..AC-19. Un test por criterio de aceptación (AGENT.md §14.1).
 * Los proveedores se inyectan con dobles: la suite NUNCA toca la red (AGENT.md §11.2).
 */
import { equal, ok } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'

const PASSWORD = 'quetzal-fuerte-2026'
const RATE = { rateMicro: 7703054, rateDate: '2026-09-21', source: 'er-api' }

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

  const accountUsd = await ctx.server.request('POST', '/api/accounts', {
    name: 'Débito USD', type: 'debit', currency: 'USD'
  }, { cookie: ctx.cookie })
  ctx.accountUsd = accountUsd.json

  const categoryExpense = await ctx.server.request('POST', '/api/categories', {
    name: 'Comida', kind: 'expense'
  }, { cookie: ctx.cookie })
  ctx.categoryExpense = categoryExpense.json

  const categoryIncome = await ctx.server.request('POST', '/api/categories', {
    name: 'Sueldo', kind: 'income'
  }, { cookie: ctx.cookie })
  ctx.categoryIncome = categoryIncome.json

  ctx.RATE = { ...RATE }
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
}

export async function teardown(ctx) {
  await ctx.server?.close()
}

/** Crea una transacción de prueba con valores por defecto sobrescribibles. */
async function createTxn(ctx, overrides = {}) {
  const body = {
    kind: 'expense',
    accountId: ctx.accountGtq.id,
    categoryId: ctx.categoryExpense.id,
    amountCents: 5000,
    currency: 'GTQ',
    occurredOn: '2026-09-21',
    description: 'Almuerzo',
    ...overrides
  }
  return ctx.server.request('POST', '/api/transactions', body, { cookie: ctx.cookie })
}

/** AC-01: crear gasto en GTQ queda registrado sin campos de conversión. */
export async function createExpenseGtq(ctx) {
  const res = await createTxn(ctx, { amountCents: 5000, currency: 'GTQ' })
  equal(res.status, 201, 'AC-01: debe responder 201')
  equal(res.json.kind, 'expense')
  equal(res.json.amountCents, 5000)
  equal(res.json.currency, 'GTQ')
  equal(res.json.amountBaseCents, 5000, 'AC-01: sin conversión el monto base es igual')
  equal(res.json.fxRateMicro, null, 'AC-01: GTQ no consulta tasa')
  equal(res.json.rateSource, null)
  equal(res.json.rateDate, null)
}

/** AC-02: crear ingreso en GTQ. */
export async function createIncomeGtq(ctx) {
  const res = await createTxn(ctx, {
    kind: 'income',
    categoryId: ctx.categoryIncome.id,
    amountCents: 10000,
    description: 'Quincena'
  })
  equal(res.status, 201, 'AC-02: debe responder 201')
  equal(res.json.kind, 'income')
  equal(res.json.amountCents, 10000)
  equal(res.json.amountBaseCents, 10000)
  equal(res.json.currency, 'GTQ')
}

/** AC-03: gasto en USD con conversión half-up congelada. */
export async function createExpenseUsdConverts(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const res = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 500,
    currency: 'USD',
    description: 'Suscripción'
  })
  equal(res.status, 201, 'AC-03: debe responder 201')
  equal(res.json.amountCents, 500)
  equal(res.json.currency, 'USD')
  equal(res.json.fxRateMicro, 7703054, 'AC-03: congela la tasa usada')
  // 500 × 7.703054 = 3851.527 → half-up 3852
  equal(res.json.amountBaseCents, 3852, 'AC-03: redondeo half-up al centavo')
  equal(res.json.rateSource, 'er-api')
  equal(res.json.rateDate, '2026-09-21')
}

/** AC-04: la tasa congelada no cambia aunque la vigente cambie (I-03). */
export async function frozenRateDoesNotChange(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const created = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 500,
    currency: 'USD',
    description: 'Congelado'
  })
  equal(created.status, 201)

  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-nueva-ac04',
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

  const detail = await ctx.server.request('GET', `/api/transactions/${created.json.id}`,
    undefined, { cookie: ctx.cookie })
  equal(detail.status, 200, 'AC-04: debe consultar el detalle')
  equal(detail.json.fxRateMicro, 7703054, 'AC-04: conserva la tasa original (I-03)')
  equal(detail.json.amountBaseCents, 3852, 'AC-04: el monto base no se recalcula')
}

/** AC-05: rechazar monto cero (I-08). */
export async function rejectZeroAmount(ctx) {
  const res = await createTxn(ctx, { amountCents: 0 })
  equal(res.status, 422, 'AC-05: debe rechazar con 422')
  equal(res.json.code, 'INVALID_AMOUNT')
}

/** AC-06: rechazar monto negativo (I-08). */
export async function rejectNegativeAmount(ctx) {
  const res = await createTxn(ctx, { amountCents: -100 })
  equal(res.status, 422, 'AC-06: debe rechazar con 422')
  equal(res.json.code, 'INVALID_AMOUNT')
}

/** AC-07: gasto con categoría de tipo income → CATEGORY_KIND_MISMATCH. */
export async function rejectCategoryKindMismatch(ctx) {
  const res = await createTxn(ctx, { categoryId: ctx.categoryIncome.id, kind: 'expense' })
  equal(res.status, 422, 'AC-07: debe rechazar con 422')
  equal(res.json.code, 'CATEGORY_KIND_MISMATCH')
}

/** AC-08: transacción en cuenta archivada → ACCOUNT_ARCHIVED. */
export async function rejectArchivedAccount(ctx) {
  const created = await ctx.server.request('POST', '/api/accounts', {
    name: 'Para archivar AC-08', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  await ctx.server.request('POST', `/api/accounts/${created.json.id}/archive`, {},
    { cookie: ctx.cookie })

  const res = await createTxn(ctx, { accountId: created.json.id })
  equal(res.status, 422, 'AC-08: debe rechazar con 422')
  equal(res.json.code, 'ACCOUNT_ARCHIVED')
}

/** AC-09: cuenta de otro espacio (o inexistente) → 404, no 403 (I-07). */
export async function rejectOtherSpaceAccount(ctx) {
  const res = await createTxn(ctx, { accountId: 'cuenta-de-otro-espacio' })
  equal(res.status, 404, 'AC-09: no filtra existencia; responde 404')
  equal(res.json.code, 'NOT_FOUND')
}

/** AC-10: USD sin ninguna tasa disponible → RATE_UNAVAILABLE. */
export async function rejectRateUnavailable(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [
    fakeProvider('er-api', null),
    fakeProvider('banguat', null)
  ]
  const res = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 500,
    currency: 'USD'
  })
  equal(res.status, 422, 'AC-10: debe rechazar con 422')
  equal(res.json.code, 'RATE_UNAVAILABLE', 'AC-10: nunca inventa una tasa')
}

/** AC-11: carry-forward reutiliza la tasa con su origen y fecha reales. */
export async function carryForwardKeepsRealSource(ctx) {
  clearRates(ctx)
  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-cf-ac11',
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

  const res = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 100,
    currency: 'USD',
    occurredOn: '2026-09-21',
    description: 'Carry-forward'
  })
  equal(res.status, 201, 'AC-11: se registra con carry-forward')
  equal(res.json.rateSource, 'er-api', 'AC-11: conserva el origen real, no "carry-forward"')
  equal(res.json.rateDate, '2026-09-18', 'AC-11: conserva la fecha original')
}

/** AC-12: editar solo la descripción no toca la tasa congelada. */
export async function editDescriptionKeepsRate(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const created = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 500,
    currency: 'USD',
    description: 'Original'
  })
  equal(created.status, 201)

  const patched = await ctx.server.request('PATCH', `/api/transactions/${created.json.id}`,
    { description: 'Descripción nueva' }, { cookie: ctx.cookie })
  equal(patched.status, 200, 'AC-12: debe responder 200')
  equal(patched.json.description, 'Descripción nueva')
  equal(patched.json.fxRateMicro, 7703054, 'AC-12: la tasa no cambia')
  equal(patched.json.amountBaseCents, 3852, 'AC-12: el monto base no cambia')
}

/** AC-13: cambiar el monto re-congela la tasa y deja rastro en audit_log (I-11). */
export async function editAmountRefreezesAndAudits(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const created = await createTxn(ctx, {
    accountId: ctx.accountUsd.id,
    amountCents: 500,
    currency: 'USD',
    description: 'Para editar monto'
  })
  equal(created.status, 201)

  const patched = await ctx.server.request('PATCH', `/api/transactions/${created.json.id}`,
    { amountCents: 1000 }, { cookie: ctx.cookie })
  equal(patched.status, 200, 'AC-13: debe responder 200')
  equal(patched.json.amountCents, 1000, 'AC-13: monto actualizado')
  equal(patched.json.fxRateMicro, 7703054, 'AC-13: tasa re-congelada')
  // 1000 × 7.703054 = 7703.054 → 7703
  equal(patched.json.amountBaseCents, 7703, 'AC-13: monto base re-congelado')

  const entries = ctx.server.deps.auditRepository.listByEntity('transactions', created.json.id)
  const update = entries.find((entry) => entry.action === 'update')
  ok(update, 'AC-13: hay entrada de auditoría update')
  ok(update.before, 'AC-13: before_json presente')
  ok(update.after, 'AC-13: after_json presente')
  equal(update.before.amountCents, 500, 'AC-13: before registra el monto previo')
  equal(update.after.amountCents, 1000, 'AC-13: after registra el monto nuevo')
}

/** AC-14: archivar excluye la transacción del listado del mes. */
export async function archiveTransaction(ctx) {
  const created = await createTxn(ctx, { description: 'Para archivar' })
  equal(created.status, 201)

  const archived = await ctx.server.request('POST',
    `/api/transactions/${created.json.id}/archive`, {}, { cookie: ctx.cookie })
  equal(archived.status, 200, 'AC-14: debe responder 200')
  equal(archived.json.archived, true, 'AC-14: queda archivada (I-05)')

  const list = await ctx.server.request(
    'GET', '/api/transactions?from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  equal(list.status, 200)
  const found = list.json.transactions.find((txn) => txn.id === created.json.id)
  equal(found, undefined, 'AC-14: no aparece en el listado sin includeArchived')
}

/** AC-15: el reembolso crea la transacción inversa y archiva la original. */
export async function refundCreatesInverse(ctx) {
  const created = await createTxn(ctx, { amountCents: 7500, description: 'Compra reembolsable' })
  equal(created.status, 201)

  const refund = await ctx.server.request('POST',
    `/api/transactions/${created.json.id}/refund`, {}, { cookie: ctx.cookie })
  equal(refund.status, 201, 'AC-15: el refund responde 201')
  equal(refund.json.kind, 'income', 'AC-15: kind inverso')
  equal(refund.json.amountCents, 7500, 'AC-15: mismo monto')
  equal(refund.json.refundOf, created.json.id, 'AC-15: enlazada a la original')
  ok(refund.json.description.startsWith('Reembolso'), 'AC-15: descripción marca el reembolso')

  const original = await ctx.server.request('GET', `/api/transactions/${created.json.id}`,
    undefined, { cookie: ctx.cookie })
  equal(original.status, 200)
  equal(original.json.archived, true, 'AC-15: la original queda archivada')
}

/** AC-16: aislamiento por espacio — 404 y ausencia en listados (I-07). */
export async function isolationBySpace(ctx) {
  const other = await ctx.server.createOwner()
  const login = await ctx.server.request('POST', '/api/auth/login', {
    email: other.email, password: PASSWORD
  })
  const otherCookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`

  const otherAccount = await ctx.server.request('POST', '/api/accounts', {
    name: 'Cuenta ajena', type: 'cash', currency: 'GTQ'
  }, { cookie: otherCookie })
  const otherCategory = await ctx.server.request('POST', '/api/categories', {
    name: 'Categoría ajena', kind: 'expense'
  }, { cookie: otherCookie })
  const otherTxn = await ctx.server.request('POST', '/api/transactions', {
    kind: 'expense',
    accountId: otherAccount.json.id,
    categoryId: otherCategory.json.id,
    amountCents: 999,
    currency: 'GTQ',
    occurredOn: '2026-09-21',
    description: 'No debe verse'
  }, { cookie: otherCookie })
  equal(otherTxn.status, 201, 'AC-16: el otro espacio sí crea su transacción')

  const list = await ctx.server.request('GET', '/api/transactions',
    undefined, { cookie: ctx.cookie })
  equal(list.status, 200)
  ok(!list.json.transactions.some((txn) => txn.id === otherTxn.json.id),
    'AC-16: la transacción ajena no aparece en el listado')

  const detail = await ctx.server.request('GET', `/api/transactions/${otherTxn.json.id}`,
    undefined, { cookie: ctx.cookie })
  equal(detail.status, 404, 'AC-16: GET de otra espacio responde 404, no 403')
  equal(detail.json.code, 'NOT_FOUND')
}

/** AC-17: totales por categoría cuadran al centavo con el total del mes. */
export async function totalsByCategoryMatchMonth(ctx) {
  clearSpaceTransactions(ctx)

  const categoryB = await ctx.server.request('POST', '/api/categories', {
    name: 'Transporte', kind: 'expense'
  }, { cookie: ctx.cookie })

  const a1 = await createTxn(ctx, { amountCents: 1000, description: 'G1' })
  const a2 = await createTxn(ctx, { amountCents: 2500, description: 'G2' })
  const b1 = await createTxn(ctx, {
    categoryId: categoryB.json.id,
    amountCents: 3000,
    description: 'G3'
  })
  equal(a1.status, 201)
  equal(a2.status, 201)
  equal(b1.status, 201)

  const summary = ctx.server.deps.transactionService.sumByCategory(ctx.owner.spaceId, 2026, 9)
  const sumByCategory = summary.byCategory.reduce((sum, row) => sum + row.total, 0)
  equal(sumByCategory, summary.total, 'AC-17: suma por categorías = total del mes')

  const list = await ctx.server.request(
    'GET', '/api/transactions?kind=expense&from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  const independent = list.json.transactions.reduce((sum, txn) => sum + txn.amountBaseCents, 0)
  equal(summary.total, independent, 'AC-17: total del servicio = suma independiente (0 centavos)')
  equal(summary.total, 6500, 'AC-17: 1000 + 2500 + 3000')
}

/** AC-18: occurred_on se guarda como el día de negocio enviado (I-09). */
export async function occurredOnGuatemalaNearMidnight(ctx) {
  const sent = '2026-09-21'
  const res = await createTxn(ctx, {
    occurredOn: sent,
    description: 'Cerca de medianoche GT'
  })
  equal(res.status, 201, 'AC-18: debe crear')
  equal(res.json.occurredOn, sent, 'AC-18: conserva el día de negocio, no lo convierte a UTC')

  const detail = await ctx.server.request('GET', `/api/transactions/${res.json.id}`,
    undefined, { cookie: ctx.cookie })
  equal(detail.json.occurredOn, sent, 'AC-18: la persistencia es idéntica al envío')
}

/** AC-19: filtros combinados y paginación. */
export async function listFiltersAndPagination(ctx) {
  clearSpaceTransactions(ctx)

  const categoryB = await ctx.server.request('POST', '/api/categories', {
    name: 'Viajes', kind: 'expense'
  }, { cookie: ctx.cookie })

  await createTxn(ctx, { amountCents: 100, occurredOn: '2026-09-01', description: 'F1' })
  await createTxn(ctx, { amountCents: 200, occurredOn: '2026-09-15', description: 'F2' })
  await createTxn(ctx, {
    amountCents: 300,
    occurredOn: '2026-09-20',
    categoryId: categoryB.json.id,
    description: 'F3'
  })
  await createTxn(ctx, {
    kind: 'income',
    categoryId: ctx.categoryIncome.id,
    amountCents: 400,
    occurredOn: '2026-09-10',
    description: 'F4'
  })
  await createTxn(ctx, {
    amountCents: 500,
    occurredOn: '2026-08-15',
    description: 'Fuera de septiembre'
  })

  const byKind = await ctx.server.request(
    'GET', '/api/transactions?kind=income&from=2026-09-01&to=2026-09-30',
    undefined, { cookie: ctx.cookie }
  )
  equal(byKind.status, 200, 'AC-19: responde 200')
  equal(byKind.json.transactions.length, 1, 'AC-19: solo ingresos de septiembre')
  equal(byKind.json.transactions[0].description, 'F4')

  const byCategory = await ctx.server.request(
    `GET`, `/api/transactions?categoryId=${categoryB.json.id}&kind=expense`,
    undefined, { cookie: ctx.cookie }
  )
  equal(byCategory.json.transactions.length, 1, 'AC-19: filtro por categoría')
  equal(byCategory.json.transactions[0].description, 'F3')

  const byAccount = await ctx.server.request(
    'GET', `/api/transactions?accountId=${ctx.accountGtq.id}&from=2026-09-01&to=2026-09-30`,
    undefined, { cookie: ctx.cookie }
  )
  ok(byAccount.json.transactions.every((txn) => txn.accountId === ctx.accountGtq.id),
    'AC-19: todas las filas cumplen accountId')
  equal(byAccount.json.transactions.length, 4, 'AC-19: cuatro movimientos GTQ en septiembre')

  const range = await ctx.server.request(
    'GET', '/api/transactions?from=2026-09-01&to=2026-09-15&kind=expense',
    undefined, { cookie: ctx.cookie }
  )
  const descriptions = range.json.transactions.map((txn) => txn.description).sort()
  equal(JSON.stringify(descriptions), JSON.stringify(['F1', 'F2']),
    'AC-19: from/to acotan el rango')

  const page1 = await ctx.server.request(
    'GET', '/api/transactions?limit=2&offset=0',
    undefined, { cookie: ctx.cookie }
  )
  const page2 = await ctx.server.request(
    'GET', '/api/transactions?limit=2&offset=2',
    undefined, { cookie: ctx.cookie }
  )
  equal(page1.json.transactions.length, 2, 'AC-19: limit=2')
  equal(page2.json.transactions.length, 2, 'AC-19: offset salta la primera página')
  ok(page1.json.transactions[0].id !== page2.json.transactions[0].id,
    'AC-19: las páginas no se superponen')
}
