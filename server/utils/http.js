import { AppError, ValidationError } from './errors.js'

/** Cabeceras de seguridad obligatorias (AGENT.md §9.6 / docs/SECURITY.md §5). */
export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'"
  }
}

/**
 * Envía una respuesta JSON con las cabeceras de seguridad.
 * @param {import('node:http').ServerResponse} res respuesta
 * @param {number} status código HTTP
 * @param {object} payload cuerpo a serializar
 * @param {object} [options] `headers` adicionales
 */
export function sendJson(res, status, payload, { headers = {} } = {}) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...securityHeaders(),
    ...headers
  })
  res.end(body)
}

/**
 * Envía el error en la forma única { error, code, status }.
 * Nunca expone el stack ni detalles internos.
 * @param {import('node:http').ServerResponse} res respuesta
 * @param {Error} error error a convertir
 * @param {{error: Function}} [logger] logger opcional (sin datos del usuario)
 */
export function sendError(res, error, logger) {
  const isApp = error instanceof AppError
  const status = isApp ? error.status : 500
  const code = isApp ? error.code : 'INTERNAL_ERROR'
  const message = isApp ? error.message : 'Error interno del servidor'
  if (!isApp) logger?.error(`error inesperado: ${error?.name || 'Error'}`)
  if (res.writableEnded) return
  sendJson(res, status, { error: message, code, status })
}

/**
 * Lee y valida el cuerpo JSON de una petición.
 * @param {import('node:http').IncomingMessage} req petición
 * @param {object} [options] `limit` en bytes
 * @returns {Promise<object>} objeto parseado (vacío si no hay cuerpo)
 */
export function readJsonBody(req, { limit = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new AppError('Cuerpo de la petición demasiado grande', { status: 413, code: 'PAYLOAD_TOO_LARGE' }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      const raw = Buffer.concat(chunks).toString('utf8')
      try {
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new ValidationError('El cuerpo debe ser un objeto JSON'))
        }
        resolve(parsed)
      } catch {
        reject(new ValidationError('JSON inválido en el cuerpo de la petición'))
      }
    })
    req.on('error', () => reject(new ValidationError('No se pudo leer el cuerpo de la petición')))
  })
}

/**
 * Parsea las cookies de la petición.
 * @param {import('node:http').IncomingMessage} req petición
 * @returns {Record<string, string>} cookies por nombre
 */
export function parseCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (name) out[name] = decodeURIComponent(value)
  }
  return out
}

/**
 * Arma una cabecera Set-Cookie.
 * @param {string} name nombre de la cookie
 * @param {string} value valor
 * @param {object} [options] `maxAgeSeconds`, `secure`, `path`, `sameSite`
 * @returns {string} cabecera lista para enviar
 */
export function buildCookie(name, value, { maxAgeSeconds = 0, secure = true, path = '/', sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`, 'HttpOnly']
  if (secure) parts.push('Secure')
  parts.push(maxAgeSeconds > 0 ? `Max-Age=${maxAgeSeconds}` : 'Max-Age=0')
  return parts.join('; ')
}

/**
 * Parsea la URL de la petición.
 * @param {import('node:http').IncomingMessage} req petición
 * @returns {{ pathname: string, query: URLSearchParams }}
 */
export function parseUrl(req) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  return { pathname: url.pathname, query: url.searchParams }
}

/**
 * Verifica el origen de una petición mutante (mitigación de CSRF, §9.6).
 * @param {import('node:http').IncomingMessage} req petición
 * @param {object} config configuración
 * @returns {boolean} true si el origen es aceptable
 */
export function isSameOrigin(req, config) {
  const origin = req.headers.origin
  if (!origin) return true // sin cabecera Origin: cliente no navegador (curl, pruebas)
  try {
    const parsed = new URL(origin)
    const host = req.headers.host || ''
    return parsed.host === host
  } catch {
    return false
  }
}
