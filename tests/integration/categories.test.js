/**
 * SPEC-003 — Categorías (gasto/ingreso, jerárquicas).
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

/** AC-01: crear categoría de gasto sin jerarquía. */
export async function createExpenseCategory(ctx) {
  const res = await ctx.server.request('POST', '/api/categories', {
    name: 'Comida', kind: 'expense'
  }, { cookie: ctx.cookie })
  equal(res.status, 201, 'AC-01: debe responder 201')
  equal(res.json.kind, 'expense')
  equal(res.json.parentId, null, 'AC-01: sin padre')
  ok(res.json.id, 'AC-01: debe tener id')
}

/** AC-02: crear categoría de ingreso sin jerarquía. */
export async function createIncomeCategory(ctx) {
  const res = await ctx.server.request('POST', '/api/categories', {
    name: 'Sueldo', kind: 'income'
  }, { cookie: ctx.cookie })
  equal(res.status, 201, 'AC-02: debe responder 201')
  equal(res.json.kind, 'income')
}

/** AC-03: crear categoría con jerarquía válida (padre raíz del mismo tipo). */
export async function createCategoryWithParent(ctx) {
  const parent = await ctx.server.request('POST', '/api/categories', {
    name: 'Transporte', kind: 'expense'
  }, { cookie: ctx.cookie })
  const child = await ctx.server.request('POST', '/api/categories', {
    name: 'Gasolina', kind: 'expense', parentId: parent.json.id
  }, { cookie: ctx.cookie })
  equal(child.status, 201, 'AC-03: debe crear la hija')
  equal(child.json.parentId, parent.json.id, 'AC-03: queda bajo ese padre')

  const tree = await ctx.server.request('GET', '/api/categories', undefined, { cookie: ctx.cookie })
  const root = tree.json.categories.find((category) => category.id === parent.json.id)
  equal(root.children.length, 1, 'AC-03: el árbol muestra la hija')
}

/** AC-04: rechazar categoría duplicada exacta (mismo espacio, tipo y nombre). */
export async function rejectDuplicateCategory(ctx) {
  await ctx.server.request('POST', '/api/categories', { name: 'Ocio', kind: 'expense' }, { cookie: ctx.cookie })
  const dup = await ctx.server.request('POST', '/api/categories', { name: 'Ocio', kind: 'expense' }, { cookie: ctx.cookie })
  equal(dup.status, 409, 'AC-04: debe rechazar con 409')
}

/** AC-05: consultar categorías del espacio (árbol de un nivel). */
export async function listCategoriesTree(ctx) {
  await ctx.server.request('POST', '/api/categories', { name: 'Salud', kind: 'expense' }, { cookie: ctx.cookie })
  const res = await ctx.server.request('GET', '/api/categories', undefined, { cookie: ctx.cookie })
  equal(res.status, 200, 'AC-05: debe responder 200')
  ok(Array.isArray(res.json.categories), 'AC-05: devuelve lista')
  ok(res.json.categories.some((category) => category.name === 'Salud'), 'AC-05: incluye la creada')
}


/** AC-06: editar categoría sin cambiar tipo. */
export async function updateCategoryName(ctx) {
  const created = await ctx.server.request('POST', '/api/categories', {
    name: 'Educación', kind: 'expense'
  }, { cookie: ctx.cookie })
  const patched = await ctx.server.request('PATCH', `/api/categories/${created.json.id}`,
    { name: 'Educación y libros' }, { cookie: ctx.cookie })
  equal(patched.status, 200, 'AC-06: debe responder 200')
  equal(patched.json.name, 'Educación y libros', 'AC-06: nombre actualizado')
  equal(patched.json.kind, 'expense', 'AC-06: el tipo no cambia')
}

/** AC-07: rechazar cambio de tipo cuando la categoría ya tiene transacciones. */
export async function rejectKindChangeWithTransactions(ctx) {
  const created = await ctx.server.request('POST', '/api/categories', {
    name: 'Con movimientos', kind: 'expense'
  }, { cookie: ctx.cookie })
  const account = await ctx.server.request('POST', '/api/accounts', {
    name: 'Cuenta AC-07', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  const now = new Date().toISOString()
  ctx.server.db.prepare(
    `INSERT INTO transactions (id, space_id, account_id, category_id, kind, amount_cents, currency,
       amount_base_cents, occurred_on, description, created_at, updated_at)
     VALUES ('tx-ac07-cat', ?, ?, ?, 'expense', 500, 'GTQ', 500, '2026-09-21', 'Prueba', ?, ?)`
  ).run(ctx.owner.spaceId, account.json.id, created.json.id, now, now)

  const patched = await ctx.server.request('PATCH', `/api/categories/${created.json.id}`,
    { kind: 'income' }, { cookie: ctx.cookie })
  equal(patched.status, 409, 'AC-07: debe rechazar el cambio de tipo con 409')
}

/** AC-08: eliminar categoría sin transacciones. */
export async function deleteUnusedCategory(ctx) {
  const created = await ctx.server.request('POST', '/api/categories', {
    name: 'Temporal', kind: 'expense'
  }, { cookie: ctx.cookie })
  const removed = await ctx.server.request('DELETE', `/api/categories/${created.json.id}`, undefined,
    { cookie: ctx.cookie })
  equal(removed.status, 200, 'AC-08: debe eliminar')
  equal(removed.json.deleted, true)

  const list = await ctx.server.request('GET', '/api/categories', undefined, { cookie: ctx.cookie })
  ok(!list.json.categories.some((category) => category.id === created.json.id),
    'AC-08: ya no aparece en la lista')
}

/** AC-09: rechazar eliminación de categoría usada en transacciones. */
export async function rejectDeleteCategoryInUse(ctx) {
  const created = await ctx.server.request('POST', '/api/categories', {
    name: 'En uso', kind: 'expense'
  }, { cookie: ctx.cookie })
  const account = await ctx.server.request('POST', '/api/accounts', {
    name: 'Cuenta AC-09', type: 'cash', currency: 'GTQ'
  }, { cookie: ctx.cookie })
  const now = new Date().toISOString()
  ctx.server.db.prepare(
    `INSERT INTO transactions (id, space_id, account_id, category_id, kind, amount_cents, currency,
       amount_base_cents, occurred_on, description, created_at, updated_at)
     VALUES ('tx-ac09-cat', ?, ?, ?, 'expense', 700, 'GTQ', 700, '2026-09-21', 'Prueba', ?, ?)`
  ).run(ctx.owner.spaceId, account.json.id, created.json.id, now, now)

  const removed = await ctx.server.request('DELETE', `/api/categories/${created.json.id}`, undefined,
    { cookie: ctx.cookie })
  equal(removed.status, 409, 'AC-09: debe rechazar con 409')
  equal(removed.json.code, 'CONFLICT')
}

/** AC-10: categoría sin transacciones ni presupuestos se puede eliminar. */
export async function deleteCategoryWithoutDependencies(ctx) {
  const created = await ctx.server.request('POST', '/api/categories', {
    name: 'Sin dependencias', kind: 'income'
  }, { cookie: ctx.cookie })
  equal(ctx.server.deps.categoryRepository.countTransactions(ctx.owner.spaceId, created.json.id), 0)
  equal(ctx.server.deps.categoryRepository.countBudgets(ctx.owner.spaceId, created.json.id), 0)

  const removed = await ctx.server.request('DELETE', `/api/categories/${created.json.id}`, undefined,
    { cookie: ctx.cookie })
  equal(removed.status, 200, 'AC-10: se elimina sin dependencias')
}
