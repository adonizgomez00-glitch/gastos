/**
 * Router mínimo sobre node:http. Soporta rutas con parámetros (`:id`)
 * y responde 404/405 con la cabecera Allow correspondiente.
 */
export class Router {
  constructor() {
    this._routes = []
  }

  /** Registra una ruta. @param {string} method @param {string} path @param {Function} handler */
  register(method, path, handler) {
    this._routes.push(this._compile(method.toUpperCase(), path, handler))
  }

  get(path, handler) { this.register('GET', path, handler) }
  post(path, handler) { this.register('POST', path, handler) }
  put(path, handler) { this.register('PUT', path, handler) }
  patch(path, handler) { this.register('PATCH', path, handler) }
  delete(path, handler) { this.register('DELETE', path, handler) }

  /**
   * Resuelve una petición.
   * @param {string} method método HTTP
   * @param {string} pathname ruta solicitada
   * @returns {{ handler?: Function, params?: object, allowed?: string[] }}
   */
  match(method, pathname) {
    const allowed = []
    const path = normalize(pathname)
    for (const route of this._routes) {
      const params = route.match(path)
      if (!params) continue
      if (route.method === method) return { handler: route.handler, params }
      allowed.push(route.method)
    }
    return allowed.length ? { allowed: [...new Set(allowed)] } : {}
  }

  _compile(method, pattern, handler) {
    const keys = []
    const source = normalize(pattern)
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          keys.push(segment.slice(1))
          return '([^/]+)'
        }
        return escapeRegex(segment)
      })
      .join('/')
    const regex = new RegExp(`^${source}/?$`)
    return {
      method,
      handler,
      match(path) {
        const found = regex.exec(path)
        if (!found) return null
        const params = {}
        keys.forEach((key, index) => { params[key] = decodeURIComponent(found[index + 1]) })
        return params
      }
    }
  }
}

/** Quita el prefijo público (GASTOS_BASE_PATH) y normaliza la ruta. */
function normalize(pathname) {
  let path = (pathname || '/').split('?')[0]
  const base = (process.env.GASTOS_BASE_PATH || '/gastos').replace(/\/+$/, '')
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/'
  if (!path.startsWith('/')) path = `/${path}`
  return path.replace(/\/+$/, '') || '/'
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
