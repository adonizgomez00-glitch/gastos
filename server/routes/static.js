import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

/**
 * Rutas de archivos estáticos de la SPA (index.html + assets).
 * Reglas: solo GET/HEAD, solo extensiones conocidas, nunca fuera de la raíz pública,
 * y toda ruta que no sea archivo cae a / (la SPA resuelve por hash).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function staticRoutes(deps) {
  return [
    {
      method: 'GET',
      path: '/',
      handler(ctx) {
        serveFile(ctx, 'index.html')
      }
    },
    {
      method: 'GET',
      path: '/assets/:dir/:file',
      handler(ctx) {
        const dir = sanitizeDir(ctx.params.dir)
        const name = sanitize(ctx.params.file)
        if (!dir || !name) return ctx.json(404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status: 404 })
        serveFile(ctx, path.join('assets', dir, name))
      }
    },
    {
      method: 'GET',
      path: '/assets/:file',
      handler(ctx) {
        const name = sanitize(ctx.params.file)
        if (!name) return ctx.json(404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status: 404 })
        serveFile(ctx, path.join('assets', name))
      }
    },
    {
      method: 'GET',
      path: '/src/:dir/:file',
      handler(ctx) {
        const dir = sanitizeDir(ctx.params.dir)
        const name = sanitize(ctx.params.file)
        if (!dir || !name || !name.endsWith('.js')) {
          return ctx.json(404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status: 404 })
        }
        serveFile(ctx, path.join('src', dir, name))
      }
    },
    {
      method: 'GET',
      path: '/src/:file',
      handler(ctx) {
        const name = sanitize(ctx.params.file)
        if (!name || !name.endsWith('.js')) {
          return ctx.json(404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status: 404 })
        }
        serveFile(ctx, path.join('src', name))
      }
    }
  ]
}

function sanitize(name) {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null
  return name
}

/**
 * Valida un nombre de subdirectorio permitido.
 * Solo se admiten las carpetas del cliente (lista cerrada).
 */
function sanitizeDir(name) {
  const allowed = new Set(['css', 'config', 'services', 'controllers', 'views'])
  return allowed.has(name) ? name : null
}

function serveFile(ctx, relative) {
  const file = path.resolve(PROJECT_DIR, relative)
  if (!file.startsWith(PROJECT_DIR)) {
    return ctx.json(403, { error: 'No autorizado', code: 'FORBIDDEN', status: 403 })
  }
  let content
  try {
    content = fs.readFileSync(file)
  } catch {
    return ctx.json(404, { error: 'Recurso no encontrado', code: 'NOT_FOUND', status: 404 })
  }
  const ext = path.extname(file)
  ctx.res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': content.length,
    'X-Content-Type-Options': 'nosniff'
  })
  ctx.res.end(content)
}
