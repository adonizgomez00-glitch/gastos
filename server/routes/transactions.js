/**
 * Rutas de transacciones (SPEC-004, docs/API.md §6).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
import { NotFoundError } from '../utils/errors.js'

export function transactionRoutes(deps) {
  const { transactionService, requireAuth, requireSpace, currentSpace } = deps

  return [
    {
      method: 'GET',
      path: '/api/transactions',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        const from = ctx.query.get('from') || undefined
        const to = ctx.query.get('to') || undefined
        const accountId = ctx.query.get('accountId') || undefined
        const categoryId = ctx.query.get('categoryId') || undefined
        const kind = ctx.query.get('kind') || undefined
        const includeArchived = ctx.query.get('includeArchived')
        const limitParam = ctx.query.get('limit')
        const offsetParam = ctx.query.get('offset')
        const txns = transactionService.list({
          spaceId: space.id,
          from,
          to,
          accountId,
          categoryId,
          kind,
          includeArchived: includeArchived === '1',
          limit: limitParam ? Number(limitParam) : undefined,
          offset: offsetParam ? Number(offsetParam) : undefined
        })
        ctx.json(200, { transactions: txns })
      }
    },
    {
      method: 'POST',
      path: '/api/transactions',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const body = ctx.body || {}
        const txn = await transactionService.create({
          spaceId: space.id,
          userId: user.id,
          kind: body.kind,
          accountId: body.accountId,
          categoryId: body.categoryId,
          amountCents: body.amountCents,
          currency: body.currency,
          occurredOn: body.occurredOn,
          description: body.description,
          notes: body.notes
        })
        ctx.json(201, txn)
      }
    },
    {
      method: 'GET',
      path: '/api/transactions/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        const txn = deps.transactionRepository.findById(space.id, ctx.params.id)
        if (!txn) {
          throw new NotFoundError('La transacción no existe en este espacio')
        }
        ctx.json(200, txn)
      }
    },
    {
      method: 'PATCH',
      path: '/api/transactions/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const updated = await transactionService.update(
          space.id, ctx.params.id, ctx.body || {}, user.id
        )
        ctx.json(200, updated)
      }
    },
    {
      method: 'POST',
      path: '/api/transactions/:id/archive',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const archived = await transactionService.archive(space.id, ctx.params.id, user.id)
        ctx.json(200, archived)
      }
    },
    {
      method: 'POST',
      path: '/api/transactions/:id/refund',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const refund = await transactionService.refund(space.id, ctx.params.id, user.id)
        ctx.json(201, refund)
      }
    }
  ]
}
