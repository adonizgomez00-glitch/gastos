/** Repositorio de usuarios. Único lugar con SQL de la tabla `users` (regla AR-03). */
export class UserRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Busca un usuario por email (normalizado a minúsculas).
   * @param {string} email email
   * @returns {object|null} usuario o null
   */
  findByEmail(email) {
    const row = this._db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email))
    return row ? toUser(row) : null
  }

  /**
   * Busca un usuario por id.
   * @param {string} id identificador
   * @returns {object|null} usuario o null
   */
  findById(id) {
    const row = this._db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    return row ? toUser(row) : null
  }

  /**
   * Crea un usuario.
   * @param {{ id: string, email: string, passwordHash: string, passwordSalt: string,
   *           passwordIterations: number, name: string, baseCurrency?: string,
   *           timezone?: string, now?: string }} data datos del usuario
   * @returns {object} usuario creado (sin campos sensibles expuestos aparte del hash)
   */
  create(data) {
    const now = data.now || new Date().toISOString()
    this._db.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, password_iterations, name,
                          base_currency, timezone, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      data.id,
      normalizeEmail(data.email),
      data.passwordHash,
      data.passwordSalt,
      data.passwordIterations,
      data.name,
      data.baseCurrency || 'GTQ',
      data.timezone || 'America/Guatemala',
      now,
      now
    )
    return this.findById(data.id)
  }

  /**
   * Actualiza hash/salt/iteraciones de la contraseña.
   * @param {string} id identificador @param {{passwordHash: string, passwordSalt: string, passwordIterations: number}} data datos
   */
  updatePassword(id, data) {
    this._db.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?'
    ).run(data.passwordHash, data.passwordSalt, data.passwordIterations, new Date().toISOString(), id)
  }

  /**
   * Activa o desactiva un usuario.
   * @param {string} id identificador @param {boolean} active estado deseado
   */
  setActive(id, active) {
    this._db.prepare('UPDATE users SET active = ?, updated_at = ? WHERE id = ?')
      .run(active ? 1 : 0, new Date().toISOString(), id)
  }

  /** @returns {number} cantidad de usuarios */
  count() {
    return Number(this._db.prepare('SELECT COUNT(*) AS total FROM users').get().total)
  }
}

/** Normaliza un email para comparaciones. @param {string} email @returns {string} */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: Number(row.password_iterations),
    name: row.name,
    baseCurrency: row.base_currency,
    timezone: row.timezone,
    active: Number(row.active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
