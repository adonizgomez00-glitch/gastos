import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Crea una función de defaults que se evalúa en el momento de construir la configuración. */
function buildDefaults() {
  return {
    service: 'gastos',
    version: '0.1.0',
    env: process.env.NODE_ENV || 'development',
    host: process.env.GASTOS_HOST || '127.0.0.1',
    port: Number(process.env.GASTOS_PORT || 8100),
    basePath: process.env.GASTOS_BASE_PATH || '/gastos',
  baseCurrency: process.env.GASTOS_BASE_CURRENCY || 'GTQ',
  timezone: process.env.GASTOS_TIMEZONE || 'America/Guatemala',
  dataDir: process.env.GASTOS_DATA_DIR || path.join(PROJECT_DIR, 'data'),
  bodyLimitBytes: Number(process.env.GASTOS_BODY_LIMIT || 1024 * 1024),
  sessionCookieName: process.env.GASTOS_SESSION_COOKIE || 'gastos_session',
  sessionTtlMinutes: Number(process.env.GASTOS_SESSION_TTL_MINUTES || 720),
  cookieSecure: process.env.GASTOS_COOKIE_SECURE === '1',
  // En produccion la app vive detras de un prefijo (nginx /gastos/), en desarrollo se sirve en '/'.
  // Si el path de la cookie no coincide con el de las peticiones, el navegador NO la envia.
  cookiePath:
    process.env.GASTOS_COOKIE_PATH ||
    (process.env.NODE_ENV === 'production' ? process.env.GASTOS_BASE_PATH || '/gastos' : '/'),
  // PBKDF2: 100.000 en producción, reducido en pruebas para que la suite no tarde
  pbkdf2Iterations: Number(
    process.env.GASTOS_PBKDF2_ITERATIONS || (process.env.NODE_ENV === 'test' ? 1000 : 100000)
  ),
  minPasswordLength: Number(process.env.GASTOS_MIN_PASSWORD_LENGTH || 12),
  loginRateLimit: {
    windowMs: Number(process.env.GASTOS_LOGIN_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.GASTOS_LOGIN_MAX_ATTEMPTS || 5)
  },
  logLevel: process.env.GASTOS_LOG_LEVEL || 'info'
  }
}

/**
 * Construye la configuración efectiva (inmutable).
 * Los `overrides` siempre tienen prioridad sobre los defaults y el entorno.
 * @param {object} [overrides] valores que pisan los defaults
 * @returns {Readonly<object>} configuración congelada
 */
export function createConfig(overrides = {}) {
  const config = { ...buildDefaults(), ...overrides }
  config.dataDir = path.resolve(config.dataDir)
  config.dbFile = path.join(config.dataDir, 'gastos.db')
  config.isProduction = config.env === 'production'
  if (!overrides.cookiePath) {
    // Debe coincidir con el path de las peticiones, o el navegador no envía la cookie.
    config.cookiePath = config.isProduction ? config.basePath : '/'
  }
  return Object.freeze(config)
}

/**
 * Redacta credenciales y datos sensibles de una configuración.
 * @returns {string} representación segura para logs
 */
export function describeConfig(config) {
  return [
    `servicio=${config.service} v${config.version}`,
    `entorno=${config.env}`,
    `host=${config.host}:${config.port}`,
    `datos=${config.dataDir}`,
    `monedaBase=${config.baseCurrency}`,
    `cookieSegura=${config.cookieSecure}`,
    `pathCookie=${config.cookiePath}`
  ].join(' · ')
}
