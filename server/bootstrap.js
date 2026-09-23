import fs from 'node:fs'
import { createConfig, describeConfig } from './config/index.js'
import { makeLogger } from './utils/logger.js'
import { openDatabase } from './database/sqlite.js'
import { MIGRATIONS } from './database/migrations/index.js'
import { applyMigrations } from './database/applyMigrations.js'
import { UserRepository } from './repositories/UserRepository.js'
import { SessionRepository } from './repositories/SessionRepository.js'
import { SpaceRepository } from './repositories/SpaceRepository.js'
import { AccountRepository } from './repositories/AccountRepository.js'
import { CategoryRepository } from './repositories/CategoryRepository.js'
import { ExchangeRateRepository } from './repositories/ExchangeRateRepository.js'
import { AuditRepository } from './repositories/AuditRepository.js'
import { TransactionRepository } from './repositories/TransactionRepository.js'
import { PasswordService } from '../src/services/PasswordService.js'
import { AuthService } from './services/AuthService.js'
import { AccountService } from './services/AccountService.js'
import { CategoryService } from './services/CategoryService.js'
import { RateService } from './services/RateService.js'
import { TransactionService } from './services/TransactionService.js'
import { ErApiProvider } from './services/rates/ErApiProvider.js'
import { BanguatProvider } from './services/rates/BanguatProvider.js'
import { RateLimiter } from './utils/rateLimiter.js'
import { createRequireAuth, createRequireSpace, extractToken } from './middleware/auth.js'
import { createApp } from './app.js'

/**
 * Construye todo el grafo de dependencias (DI manual, regla AR-04).
 * Orden obligatorio: config → logger → db → migraciones → repositorios → servicios → app.
 * @param {object} [overrides] `config`, `logger`, `clock`, `ratesFetch` (pruebas)
 * @returns {object} dependencias listas para usar
 */
export function bootstrap(overrides = {}) {
  const config = createConfig(overrides.config || {})
  const logLines = overrides.logLines || null
  const logger = overrides.logger || makeLogger({
    level: overrides.logLevel || config.logLevel,
    sink: logLines ? (line) => logLines.push(line) : undefined
  })

  fs.mkdirSync(config.dataDir, { recursive: true })

  const db = openDatabase(config.dbFile)
  const { applied, skipped } = applyMigrations(db, MIGRATIONS)
  if (applied.length) logger.info(`migraciones aplicadas: ${applied.join(', ')}`)
  logger.debug(`migraciones ya aplicadas: ${skipped.length}`)

  const userRepository = new UserRepository(db)
  const sessionRepository = new SessionRepository(db)
  const spaceRepository = new SpaceRepository(db)
  const accountRepository = new AccountRepository(db)
  const categoryRepository = new CategoryRepository(db)
  const exchangeRateRepository = new ExchangeRateRepository(db)
  const auditRepository = new AuditRepository(db)
  const transactionRepository = new TransactionRepository(db)
  const passwordService = new PasswordService({ iterations: config.pbkdf2Iterations })
  const rateLimiter = new RateLimiter(overrides.rateLimiterOptions || { ...config.loginRateLimit })

  const clock = overrides.clock || (() => new Date())

  // Proveedores de cotización en orden de prioridad (ADR-004).
  // `overrides.ratesFetch` permite inyectar un doble en las pruebas.
  const rateService = new RateService({
    rateRepository: exchangeRateRepository,
    providers: overrides.ratesProviders || [
      new ErApiProvider({ fetchImpl: overrides.ratesFetch }),
      new BanguatProvider({ fetchImpl: overrides.ratesFetch })
    ],
    clock
  })

  const authService = new AuthService({
    config,
    logger,
    userRepository,
    sessionRepository,
    spaceRepository,
    passwordService,
    rateLimiter,
    clock
  })

  const accountService = new AccountService({ accountRepository, auditRepository })
  const categoryService = new CategoryService({ categoryRepository, auditRepository })
  const transactionService = new TransactionService({
    db, transactionRepository, accountRepository, categoryRepository, auditRepository, rateService
  })

  authService.purgeExpiredSessions()
  logger.info(`bootstrap: ${describeConfig(config)}`)

  const deps = {
    config,
    logger,
    db,
    userRepository,
    sessionRepository,
    spaceRepository,
    accountRepository,
    categoryRepository,
    exchangeRateRepository,
    auditRepository,
    transactionRepository,
    passwordService,
    authService,
    accountService,
    categoryService,
    transactionService,
    rateService,
    rateLimiter,
    clock,
    extractToken,
    requireAuth: createRequireAuth({ config, authService }),
    requireSpace: createRequireSpace({ config, authService, spaceRepository }),
    currentSpace: (user) => spaceRepository.ensureForOwner({ ownerUserId: user.id }),
    logLines
  }

  return { ...deps, app: createApp(deps) }
}

