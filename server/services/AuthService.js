import { randomBytes, randomUUID } from 'node:crypto'
import { ValidationError, InvalidCredentialsError, TooManyRequestsError } from '../utils/errors.js'

const TOKEN_BYTES = 32

/**
 * Servicio de autenticación del dueño (SPEC-001).
 * Reglas: mensaje genérico ante credenciales inválidas, límite de intentos,
 * sesión revocable en base de datos y purga de sesiones vencidas.
 */
export class AuthService {
  /**
   * @param {object} deps dependencias
   * @param {object} deps.config configuración
   * @param {object} deps.logger logger (sin datos del usuario)
   * @param {import('../repositories/UserRepository.js').UserRepository} deps.userRepository
   * @param {import('../repositories/SessionRepository.js').SessionRepository} deps.sessionRepository
   * @param {import('../repositories/SpaceRepository.js').SpaceRepository} [deps.spaceRepository]
   * @param {import('../../src/services/PasswordService.js').PasswordService} deps.passwordService
   * @param {import('../utils/rateLimiter.js').RateLimiter} deps.rateLimiter
   * @param {() => Date} [deps.clock] reloj inyectable (pruebas)
   */
  constructor({ config, logger, userRepository, sessionRepository, spaceRepository = null, passwordService, rateLimiter, clock = () => new Date() }) {
    this._config = config
    this._logger = logger
    this._users = userRepository
    this._sessions = sessionRepository
    this._spaces = spaceRepository
    this._passwords = passwordService
    this._rateLimiter = rateLimiter
    this._clock = clock
  }

  /** @returns {string} instante actual en ISO-8601 */
  _now() {
    return this._clock().toISOString()
  }

  /**
   * Crea el usuario dueño (alta por CLI, no hay registro público).
   * @param {{ email: string, name: string, password: string, baseCurrency?: string, timezone?: string }} data datos
   * @returns {Promise<object>} usuario creado
   */
  async createOwner({ email, name, password, baseCurrency, timezone }) {
    const normalized = String(email || '').trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) throw new ValidationError('Email inválido')
    if (!String(name || '').trim()) throw new ValidationError('El nombre es obligatorio')
    if (String(password || '').length < this._config.minPasswordLength) {
      throw new ValidationError(
        `La contraseña debe tener al menos ${this._config.minPasswordLength} caracteres`
      )
    }
    if (this._users.findByEmail(normalized)) throw new ValidationError('Ya existe un usuario con ese email')

    const { hash, salt, iterations } = await this._passwords.hash(password)
    const user = this._users.create({
      id: randomUUID(),
      email: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: iterations,
      name: String(name).trim(),
      baseCurrency: baseCurrency || this._config.baseCurrency,
      timezone: timezone || this._config.timezone
    })

    // El espacio del dueño se crea junto con el usuario (ADR-006): sin él no hay
    // dónde colgar cuentas, categorías ni transacciones (ITER-004).
    if (this._spaces) {
      const space = this._spaces.ensureForOwner({
        ownerUserId: user.id,
        name: `Espacio de ${user.name}`
      })
      return { ...user, spaceId: space.id }
    }

    return user
  }

  /**
   * Inicia sesión.
   * @param {object} input datos del intento
   * @param {string} input.email email
   * @param {string} input.password contraseña en claro
   * @param {string} [input.ip] IP del cliente
   * @param {string} [input.userAgent] agente del cliente
   * @returns {Promise<{ token: string, expiresAt: string, user: object }>}
   * @throws {TooManyRequestsError|InvalidCredentialsError}
   */
  async login({ email, password, ip = 'desconocida', userAgent = '' }) {
    const key = this._rateLimitKey(email, ip)
    const attempt = this._rateLimiter.hit(key)
    if (!attempt.allowed) throw new TooManyRequestsError()

    const user = this._users.findByEmail(email)
    const invalid = new InvalidCredentialsError()
    if (!user || !user.active) {
      // Se deriva igual para no revelar, por tiempo de respuesta, si el email existe (AC-03/AC-15).
      if (!user) await this._passwords.derive(String(password || ''), '0'.repeat(64), this._passwords.iterations)
      throw invalid
    }

    const ok = await this._passwords.verify(String(password || ''), {
      hash: user.passwordHash,
      salt: user.passwordSalt,
      iterations: user.passwordIterations
    })
    if (!ok) throw invalid

    this._rateLimiter.reset(key)
    this._sessions.purgeExpired(this._now())

    const now = this._clock()
    const expiresAt = new Date(now.getTime() + this._config.sessionTtlMinutes * 60_000).toISOString()
    const token = randomBytes(TOKEN_BYTES).toString('hex')
    this._sessions.create({ token, userId: user.id, createdAt: now.toISOString(), expiresAt, ip, userAgent })

    return { token, expiresAt, user: publicUser(user) }
  }

  /**
   * Cierra la sesión invalidando el token en la base de datos.
   * @param {string} token token de sesión
   * @returns {{ ok: true, revoked: number }}
   */
  logout(token) {
    const revoked = token ? this._sessions.deleteByToken(token) : 0
    return { ok: true, revoked }
  }

  /**
   * Resuelve una sesión vigente.
   * Regla: encontrar una sesión vencida la elimina de inmediato (AC-07),
   * para que ningún token muerto quede en la base de datos.
   * @param {string} token token de sesión
   * @returns {object|null} usuario autenticado o null
   */
  resolveSession(token) {
    if (!token) return null
    const session = this._sessions.findValid(token, this._now())
    if (session) {
      const user = this._users.findById(session.userId)
      if (user && user.active) return publicUser(user)
      this._sessions.deleteByToken(token)
      return null
    }
    // No vigente: si existe pero vencida, se elimina de inmediato.
    if (this._sessions.findAny(token)) this._sessions.deleteByToken(token)
    return null
  }

  /** Purga sesiones vencidas (arranque del servidor). @returns {number} filas borradas */
  purgeExpiredSessions() {
    return this._sessions.purgeExpired(this._now())
  }

  /** @returns {number} cantidad de usuarios registrados */
  countUsers() {
    return this._users.count()
  }

  _rateLimitKey(email, ip) {
    return `${ip}|${String(email || '').trim().toLowerCase()}`
  }
}

/**
 * Proyecta un usuario para exponerlo al cliente (sin hash ni salt).
 * @param {object} user usuario completo
 * @returns {{ id: string, email: string, name: string, baseCurrency: string, timezone: string }}
 */
export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: user.baseCurrency,
    timezone: user.timezone
  }
}
