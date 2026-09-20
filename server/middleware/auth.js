import { UnauthenticatedError } from '../utils/errors.js'

/**
 * Extrae el token de sesión de la cabecera Authorization o de la cookie.
 * @param {import('node:http').IncomingMessage} req petición
 * @param {string} cookieName nombre de la cookie
 * @returns {string|null} token o null
 */
export function extractToken(req, cookieName) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim()
    if (token) return token
  }
  const cookie = req.headers.cookie || ''
  for (const part of cookie.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    if (part.slice(0, idx).trim() === cookieName) {
      return decodeURIComponent(part.slice(idx + 1).trim()) || null
    }
  }
  return null
}

/**
 * Exige una sesión válida y coloca el usuario en `ctx.auth`.
 * @param {object} deps dependencias (`authService`, `config`)
 * @returns {(ctx: object) => Promise<object>} guardia
 */
export function createRequireAuth(deps) {
  return async function requireAuth(ctx) {
    const token = extractToken(ctx.req, deps.config.sessionCookieName)
    if (!token) throw new UnauthenticatedError()
    const user = await deps.authService.resolveSession(token)
    if (!user) throw new UnauthenticatedError()
    ctx.auth = user
    ctx.sessionToken = token
    return user
  }
}

/**
 * Exige que el usuario autenticado sea miembro del espacio indicado.
 * Preparado para el multiusuario (ADR-006); en el MVP hay un espacio por dueño.
 * @param {object} deps dependencias
 * @returns {(ctx: object, spaceId: string) => object} guardia
 */
export function createRequireSpace(deps) {
  return function requireSpace(ctx, spaceId) {
    if (!ctx.auth) throw new UnauthenticatedError()
    if (!spaceId) throw new UnauthenticatedError()
    return ctx.auth
  }
}
