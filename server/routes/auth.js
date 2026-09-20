import { buildCookie } from '../utils/http.js'

/**
 * Rutas de autenticación (SPEC-001).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function authRoutes(deps) {
  const { config, authService, requireAuth } = deps
  const cookieOptions = {
    secure: config.cookieSecure,
    path: config.cookiePath || '/',
    sameSite: 'Lax'
  }

  return [
    {
      method: 'POST',
      path: '/api/auth/login',
      async handler(ctx) {
        const { email, password } = ctx.body
        const result = await authService.login({
          email,
          password,
          ip: ctx.req.socket?.remoteAddress || 'desconocida',
          userAgent: String(ctx.req.headers['user-agent'] || 'desconocido')
        })
        const maxAge = config.sessionTtlMinutes * 60
        ctx.json(200, result.user, {
          headers: {
            'Set-Cookie': buildCookie(config.sessionCookieName, result.token, { ...cookieOptions, maxAgeSeconds: maxAge })
          }
        })
      }
    },
    {
      method: 'POST',
      path: '/api/auth/logout',
      async handler(ctx) {
        const token = deps.extractToken(ctx.req, config.sessionCookieName)
        const result = authService.logout(token)
        ctx.json(200, result, {
          headers: {
            'Set-Cookie': buildCookie(config.sessionCookieName, '', { ...cookieOptions, maxAgeSeconds: 0 })
          }
        })
      }
    },
    {
      method: 'GET',
      path: '/api/auth/me',
      async handler(ctx) {
        await requireAuth(ctx)
        ctx.json(200, ctx.auth)
      }
    }
  ]
}
