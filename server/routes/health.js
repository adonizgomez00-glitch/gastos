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
          rates: ratesFreshness(deps),
          service: ctx.config.service,
          version: ctx.config.version
        })
      }
    }
  ]
}

/**
 * Estado de frescura de la última tasa registrada (SPEC-008 AC-08).
 * `missing` si no hay ninguna; `stale` a más de 24 h.
 * @param {object} deps dependencias
 * @returns {'ok'|'stale'|'missing'} estado
 */
function ratesFreshness(deps) {
  try {
    const latest = deps.exchangeRateRepository?.findLatest('USD', 'GTQ')
    if (!latest) return 'missing'
    const ageHours = (Date.now() - new Date(latest.fetchedAt).getTime()) / 3_600_000
    return ageHours > 24 ? 'stale' : 'ok'
  } catch {
    return 'missing'
  }
}

