import { randomUUID } from 'node:crypto'

/**
 * Repositorio de espacios y membresías. Único lugar con SQL de `spaces` y `space_members`.
 * En el MVP hay un espacio por dueño (ADR-006); el modelo soporta varios.
 */
export class SpaceRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Crea un espacio y su membresía `owner` en una sola transacción.
   * @param {{ id?: string, ownerUserId: string, name: string, now?: string }} data datos
   * @returns {object} espacio creado
   */
  create({ id = randomUUID(), ownerUserId, name, now = new Date().toISOString() }) {
    this._db.exec('BEGIN IMMEDIATE')
    try {
      this._db.prepare(
        `INSERT INTO spaces (id, owner_user_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, ownerUserId, name, now, now)
      this._db.prepare(
        `INSERT INTO space_members (space_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`
      ).run(id, ownerUserId, now)
      this._db.exec('COMMIT')
    } catch (error) {
      this._db.exec('ROLLBACK')
      throw error
    }
    return this.findById(id)
  }

  /**
   * Busca un espacio por id.
   * @param {string} id identificador
   * @returns {object|null} espacio o null
   */
  findById(id) {
    const row = this._db.prepare('SELECT * FROM spaces WHERE id = ?').get(id)
    return row ? toSpace(row) : null
  }

  /**
   * Busca el espacio del que el usuario es dueño.
   * @param {string} ownerUserId identificador del dueño
   * @returns {object|null} espacio o null
   */
  findByOwner(ownerUserId) {
    const row = this._db.prepare('SELECT * FROM spaces WHERE owner_user_id = ? LIMIT 1').get(ownerUserId)
    return row ? toSpace(row) : null
  }

  /**
   * Devuelve el espacio del dueño, creándolo si no existe.
   * Es idempotente: el alta del dueño y el arranque pueden invocarlo sin duplicar.
   * @param {{ ownerUserId: string, name?: string }} data datos
   * @returns {object} espacio existente o recién creado
   */
  ensureForOwner({ ownerUserId, name = 'Espacio personal' }) {
    return this.findByOwner(ownerUserId) || this.create({ ownerUserId, name })
  }

  /**
   * Indica si el usuario pertenece al espacio (requireSpace, I-07).
   * @param {string} spaceId espacio @param {string} userId usuario
   * @returns {boolean} true si pertenece
   */
  isMember(spaceId, userId) {
    const row = this._db.prepare(
      'SELECT 1 AS ok FROM space_members WHERE space_id = ? AND user_id = ?'
    ).get(spaceId, userId)
    return Boolean(row)
  }

  /** @returns {number} cantidad de espacios */
  count() {
    return Number(this._db.prepare('SELECT COUNT(*) AS total FROM spaces').get().total)
  }
}

function toSpace(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
