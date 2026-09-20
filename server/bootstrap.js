import fs from 'node:fs'
import { createConfig, describeConfig } from './config/index.js'
import { makeLogger } from './utils/logger.js'
import { openDatabase } from './database/sqlite.js'
import { MIGRATIONS } from './database/migrations/index.js'
import { applyMigrations } from './database/applyMigrations.js'
import { UserRepository } from './repositories/UserRepository.js'
import { SessionRepository } from './repositories/SessionRepository.js'
import { PasswordService } from '../src/services/PasswordService.js'
import { AuthService } from './services/AuthService.js'
import { RateLimiter } from './utils/rateLimiter.js'
import { createRequireAuth, createRequireSpace, extractToken } from './middleware/auth.js'
import { createApp } from './app.js'

/**
 * Construye todo el grafo de dependencias (DI manual, regla AR-04).
 * Orden obligatorio: config → logger → db → migraciones → repositorios → servicios → app.
 * @param {object} [overrides] `config`, `logger`, `clock` (pruebas)
 * @returns {object} dependencias listas para usar
 */
export function bootstrap(overrides = {}) {
  const config = createConfig(overrides.config || {})
  const logLines = overrides.logLines || []
  const logger = overrides.logger || makeLogger({
    level: overrides.logLevel || config.logLevel,
    sink: logLines.length ? (line) => logLines.push(line) : undefined
  })

  fs.mkdirSync(config.dataDir, { recursive: true })

  const db = openDatabase(config.dbFile)
  const { applied, skipped } = applyMigrations(db, MIGRATIONS)
  if (applied.length) logger.info(`migraciones aplicadas: ${applied.join(', ')}`)
  logger.debug(`migraciones ya aplicadas: ${skipped.length}`)

  const userRepository = new UserRepository(db)
  const sessionRepository = new SessionRepository(db)
  const passwordService = new PasswordService({ iterations: config.pbkdf2Iterations })
  const rateLimiter = new RateLimiter({ ...config.loginRateLimit, now: overrides.now })

  const authService = new AuthService({
    config,
    logger,
    userRepository,
    sessionRepository,
    passwordService,
    rateLimiter,
    clock: overrides.clock
  })

  authService.purgeExpiredSessions()
  logger.info(`bootstrap: ${describeConfig(config)}`)

  const deps = {
    config,
    logger,
    db,
    userRepository,
    sessionRepository,
    passwordService,
    authService,
    rateLimiter,
    extractToken,
    requireAuth: createRequireAuth({ config, authService }),
    requireSpace: createRequireSpace({ config, authService }),
    logLines
  }

  return { ...deps, app: createApp(deps) }
}
