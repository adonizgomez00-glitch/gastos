/**
 * Rutas de categorías (SPEC-003, docs/API.md §5).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function categoryRoutes(deps) {
  const { categoryService, requireAuth, requireSpace, currentSpace } = deps

  return [
    {
      method: 'GET',
      path: '/api/categories',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        const kind = ctx.query.get('kind') || undefined
        const includeArchived = ctx.query.get('includeArchived') === '1'
        ctx.json(200, { categories: categoryService.tree(space.id, { kind, includeArchived }) })
      }
    },
    {
      method: 'POST',
      path: '/api/categories',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const category = categoryService.create({
          spaceId: space.id,
          userId: user.id,
          name: ctx.body.name,
          kind: ctx.body.kind,
          parentId: ctx.body.parentId ?? null,
          color: ctx.body.color ?? null,
          icon: ctx.body.icon ?? null
        })
        ctx.json(201, category)
      }
    },
    {
      method: 'GET',
      path: '/api/categories/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        ctx.json(200, categoryService.get(space.id, ctx.params.id))
      }
    },
    {
      method: 'PATCH',
      path: '/api/categories/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const category = categoryService.update({
          spaceId: space.id,
          userId: user.id,
          id: ctx.params.id,
          changes: ctx.body
        })
        ctx.json(200, category)
      }
    },
    {
      method: 'POST',
      path: '/api/categories/:id/archive',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        const category = categoryService.archive({
          spaceId: space.id,
          userId: user.id,
          id: ctx.params.id
        })
        ctx.json(200, category)
      }
    },
    {
      method: 'DELETE',
      path: '/api/categories/:id',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)
        ctx.json(200, categoryService.remove({
          spaceId: space.id,
          userId: user.id,
          id: ctx.params.id
        }))
      }
    }
  ]
}
