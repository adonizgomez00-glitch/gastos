import { ValidationError } from '../utils/errors.js'

/**
 * Rutas de cuentas (SPEC-002, docs/API.md §4).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function accountRoutes(deps) {
  const { accountService, requireAuth, requireSpace, currentSpace } = deps

  return [
    {
      method: 'GET',
      path: '/api/accounts',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        const includeArchived = ctx.query.get('includeArchived') === '1'
        ctx.json(200, { accounts: accountService.list(space.id, { includeArchived }) })
      }
    },
    {
      method: 'POST',
      path: '/api/accounts',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const account = accountService.create({
          spaceId: space.id,
          userId: user.id,
          name: ctx.body.name,
          type: ctx.body.type,
          currency: ctx.body.currency,
          openingBalanceCents: ctx.body.openingBalanceCents ?? 0
        })
        ctx.json(201, account)
      }
    },
    {
      method: 'GET',
      path: '/api/accounts/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        ctx.json(200, accountService.get(space.id, ctx.params.id))
      }
    },
    {
      method: 'PATCH',
      path: '/api/accounts/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const account = accountService.update({
          spaceId: space.id,
          userId: user.id,
          id: ctx.params.id,
          changes: ctx.body
        })
        ctx.json(200, account)
      }
    },
    {
      method: 'POST',
      path: '/api/accounts/:id/archive',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const archived = ctx.body?.archived === false
        const account = archived
          ? accountService.unarchive({ spaceId: space.id, userId: user.id, id: ctx.params.id })
          : accountService.archive({ spaceId: space.id, userId: user.id, id: ctx.params.id })
        ctx.json(200, account)
      }
    }
  ]
}

/** Valida que el cuerpo traiga un identificador. @throws {ValidationError} */
export function requireParam(value, name) {
  if (!value) throw new ValidationError(`Falta el parámetro ${name}`)
  return value
}
