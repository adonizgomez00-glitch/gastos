/** Repositorio de sesiones. Único lugar con SQL de la tabla `sessions`. */
export class SessionRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Crea una sesión.
   * @param {{ token: string, userId: string, createdAt: string, expiresAt: string, ip?: string, userAgent?: string }} data datos
   */
  create(data) {
    this._db.prepare(
      `INSERT INTO sessions (token, user_id, created_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(data.token, data.userId, data.createdAt, data.expiresAt, data.ip || null, data.userAgent || null)
  }

  /**
   * Busca una sesión vigente (no vencida) por token.
   * @param {string} token token de sesión
   * @param {string} nowISO instante actual ISO-8601
   * @returns {object|null} sesión o null
   */
  findValid(token, nowISO) {
    const row = this._db.prepare(
      'SELECT * FROM sessions WHERE token = ? AND expires_at > ?'
    ).get(token, nowISO)
    return row ? toSession(row) : null
  }

  /**
   * Busca una sesión por token, vigente o no (se usa para limpiar vencidas al encontrarlas, AC-07).
   * @param {string} token token
   * @returns {object|null} sesión o null
   */
  findAny(token) {
    const row = this._db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
    return row ? toSession(row) : null
  }

  /**
   * Elimina una sesión por token (logout).
   * @param {string} token token
   * @returns {number} filas borradas
   */
  deleteByToken(token) {
    return this._db.prepare('DELETE FROM sessions WHERE token = ?').run(token).changes
  }

  /**
   * Purga las sesiones vencidas.
   * @param {string} nowISO instante actual ISO-8601
   * @returns {number} filas borradas
   */
  purgeExpired(nowISO) {
    return this._db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowISO).changes
  }

  /** @param {string} userId identificador @returns {number} sesiones del usuario */
  countByUser(userId) {
    return Number(this._db.prepare('SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?').get(userId).total)
  }
}

function toSession(row) {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ip: row.ip,
    userAgent: row.user_agent
  }
}
