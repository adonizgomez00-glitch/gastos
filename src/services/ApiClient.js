/**
 * Cliente HTTP de la aplicación. Usa rutas RELATIVAS (AGENT.md §10.3):
 * funciona igual en desarrollo (http://127.0.0.1:8100/) y en producción (/gastos/).
 */
export class ApiClient {
  /**
   * Petición JSON.
   * @param {string} method método HTTP
   * @param {string} routePath ruta RELATIVA (por ejemplo 'api/auth/login')
   * @param {object} [body] cuerpo
   * @returns {Promise<{ status: number, data: object|null, raw: string }>}
   */
  async request(method, routePath, body) {
    if (typeof routePath !== 'string' || routePath.startsWith('/')) {
      throw new Error('La ruta debe ser relativa (sin barra inicial)')
    }
    const response = await fetch(routePath, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    })
    const raw = await response.text()
    let data = null
    try {
      data = raw ? JSON.parse(raw) : null
    } catch {
      data = null
    }
    return { status: response.status, data, raw }
  }

  /** Atajos. */
  get(routePath) { return this.request('GET', routePath) }
  post(routePath, body) { return this.request('POST', routePath, body) }
}

export const api = new ApiClient()
