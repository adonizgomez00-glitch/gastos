/**
 * Rutas de salud. No exponen datos del usuario y no requieren sesión.
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function healthRoutes(deps) {
  return [
    {
      method: 'GET',
      path: '/api/health',
      handler(ctx) {
        let db = 'up'
        try {
          deps.db.prepare('SELECT 1 AS ok').get()
        } catch {
          db = 'down'
        }
        const status = db === 'up' ? 200 : 503
        ctx.json(status, {
          status: db === 'up' ? 'ok' : 'degraded',
          db,
          rates: 'missing', // se completa con SPEC-008 (tipos de cambio)
          service: ctx.config.service,
          version: ctx.config.version
        })
      }
    }
  ]
}
