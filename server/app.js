import { AppError, ForbiddenError } from './utils/errors.js'
import { isSameOrigin, parseUrl, readJsonBody, sendError, sendJson } from './utils/http.js'
import { Router } from './router.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { staticRoutes } from './routes/static.js'

const METHODS_WITH_BODY = ['POST', 'PUT', 'PATCH']

/**
 * Construye el manejador HTTP de la aplicación.
 * @param {object} deps dependencias construidas por bootstrap.js (DI manual)
 * @returns {(req: any, res: any) => Promise<void>} manejador de peticiones
 */
export function createApp(deps) {
  const { config, logger } = deps
  const router = new Router()

  for (const route of [...healthRoutes(deps), ...authRoutes(deps), ...staticRoutes(deps)]) {
    router.register(route.method, route.path, route.handler)
  }

  return async function handleRequest(req, res) {
    const started = Date.now()
    const method = (req.method || 'GET').toUpperCase()
    const { pathname } = parseUrl(req)
    let status = 200
    try {
      const match = router.match(method, pathname)

      if (!match.handler) {
        if (match.allowed?.length) {
          status = 405
          sendJson(res, 405, { error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED', status }, {
            headers: { Allow: match.allowed.join(', ') }
          })
          return
        }
        status = 404
        sendJson(res, 404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status })
        return
      }

      if (METHODS_WITH_BODY.includes(method) && !isSameOrigin(req, config)) {
        throw new ForbiddenError('Origen no permitido')
      }

      const ctx = {
        config,
        deps,
        logger,
        params: match.params,
        req,
        res,
        body: METHODS_WITH_BODY.includes(method) ? await readJsonBody(req, { limit: config.bodyLimitBytes }) : {},
        json(code, payload, options) {
          sendJson(res, code, payload, options)
        },
        error(err) {
          sendError(res, err, logger)
        }
      }

      const result = await match.handler(ctx)
      if (result !== undefined && typeof result !== 'object') {
        throw new AppError('Respuesta de controlador inválida')
      }
    } catch (error) {
      status = error instanceof AppError ? error.status : 500
      sendError(res, error, logger)
    } finally {
      logger.debug(`${method} ${pathname} -> ${status} ${Date.now() - started}ms`)
    }
  }
}
