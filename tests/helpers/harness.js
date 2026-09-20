/**
 * Harness de pruebas: levanta la app en un puerto efímero (0) sobre una base de
 * datos temporal desechable, y ofrece un cliente HTTP con manejo de cookies.
 * Nunca toca data/gastos.db (AGENT.md §11.2).
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { bootstrap } from '../../server/bootstrap.js'

/**
 * Arranca una instancia aislada para pruebas.
 * @param {object} [options] `clock` (reloj inyectable), `config` (sobrescribe defaults)
 * @returns {Promise<object>} contexto de prueba con `request`, `close`, `deps`, `config`, `lines`
 */
export async function startTestServer(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastos-test-'))
  const logLines = []
  const deps = bootstrap({
    clock: options.clock,
    logLines,
    logLevel: 'error',
    config: {
      env: 'test',
      dataDir,
      cookieSecure: false,
      pbkdf2Iterations: 1000,
      port: 0,
      ...options.config
    }
  })

  const server = http.createServer(deps.app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  const baseUrl = `http://127.0.0.1:${port}`

  return {
    deps,
    config: deps.config,
    baseUrl,
    lines: logLines,
    db: deps.db,
    authService: deps.authService,
    passwordService: deps.passwordService,

    /**
     * Petición HTTP con cookies persistentes y parseo de JSON.
     * @param {string} method @param {string} routePath @param {object} [body]
     * @param {object} [extra] `headers` adicionales
     */
    async request(method, routePath, body, extra = {}) {
      const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(extra.headers || {}) }
      if (extra.cookie) headers.Cookie = extra.cookie
      const response = await fetch(`${baseUrl}${routePath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual'
      })
      const setCookie = response.headers.getSetCookie?.() || []
      const text = await response.text()
      let json = null
      try { json = text ? JSON.parse(text) : null } catch { json = null }
      return { status: response.status, json, text, headers: response.headers, setCookie }
    },

    /** Crea el usuario dueño de prueba. @param {object} [data] */
    async createOwner(data = {}) {
      return deps.authService.createOwner({
        email: data.email || `dueno-${randomUUID().slice(0, 8)}@example.com`,
        name: data.name || 'Dueño de prueba',
        password: data.password || 'quetzal-fuerte-2026'
      })
    },

    /** Cierra el servidor y borra la base temporal. */
    async close() {
      await new Promise((resolve) => server.close(resolve))
      try { deps.db.close() } catch { /* ya cerrada */ }
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  }
}

/**
 * Extrae el valor de una cookie de las cabeceras Set-Cookie.
 * @param {string[]} setCookie cabeceras
 * @param {string} name nombre de la cookie
 * @returns {string|null} valor o null
 */
export function cookieValue(setCookie, name) {
  for (const header of setCookie) {
    if (header.startsWith(`${name}=`)) {
      const raw = header.split(';')[0].slice(name.length + 1)
      return decodeURIComponent(raw)
    }
  }
  return null
}

/**
 * Devuelve la cabecera Set-Cookie completa de una cookie.
 * @param {string[]} setCookie cabeceras
 * @param {string} name nombre
 * @returns {string|null} cabecera o null
 */
export function cookieHeader(setCookie, name) {
  return setCookie.find((header) => header.startsWith(`${name}=`)) || null
}
