/**
 * Rutas de transferencias (SPEC-005, docs/API.md §7).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function transferRoutes(deps) {
  const { transactionService, requireAuth, requireSpace, currentSpace } = deps

  return [
    {
      method: 'POST',
      path: '/api/transfers',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const body = ctx.body || {}
        const transfer = await transactionService.createTransfer({
          spaceId: space.id,
          userId: user.id,
          fromAccountId: body.fromAccountId,
          toAccountId: body.toAccountId,
          amountCents: body.amountCents,
          currency: body.currency,
          occurredOn: body.occurredOn,
          note: body.note
        })
        ctx.json(201, transfer)
      }
    },
    {
      method: 'GET',
      path: '/api/transfers',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        const from = ctx.query.get('from') || undefined
        const to = ctx.query.get('to') || undefined
        const transfers = transactionService.listTransfers({
          spaceId: space.id,
          from,
          to
        })
        ctx.json(200, { transfers })
      }
    },
    {
      method: 'DELETE',
      path: '/api/transfers/:groupId',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const result = transactionService.deleteTransfer({
          spaceId: space.id,
          userId: user.id,
          groupId: ctx.params.groupId
        })
        ctx.json(200, result)
      }
    }
  ]
}
