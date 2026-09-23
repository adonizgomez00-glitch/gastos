import { randomUUID } from 'node:crypto'

/**
 * Repositorio de auditoría (I-11). Único lugar con SQL de la tabla `audit_log`.
 * Toda mutación de cuentas, categorías y presupuestos se registra acá.
 */
export class AuditRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Registra una mutación.
   * @param {object} data datos de la auditoría
   * @param {string} data.entity entidad afectada
   * @param {string} data.entityId id afectado
   * @param {string} data.action `create` | `update` | `delete` | `archive` | `unarchive`
   * @param {object|null} [data.before] estado previo
   * @param {object|null} [data.after] estado posterior
   * @param {string} [data.spaceId] espacio
   * @param {string} [data.userId] usuario que ejecuta
   * @returns {object} fila creada
   */
  record({ entity, entityId, action, before = null, after = null, spaceId = null, userId = null }) {
    const id = randomUUID()
    this._db.prepare(
      `INSERT INTO audit_log (id, space_id, user_id, entity, entity_id, action,
                              before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      spaceId,
      userId,
      entity,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      new Date().toISOString()
    )
    return this.findById(id)
  }

  /**
   * Busca una entrada de auditoría.
   * @param {string} id identificador
   * @returns {object|null} entrada o null
   */
  findById(id) {
    const row = this._db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id)
    return row ? toEntry(row) : null
  }

  /**
   * Lista las entradas de una entidad (uso en pruebas y diagnóstico).
   * @param {string} entity entidad @param {string} entityId id afectado
   * @returns {object[]} entradas en orden cronológico
   */
  listByEntity(entity, entityId) {
    return this._db.prepare(
      'SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY created_at, rowid'
    ).all(entity, entityId).map(toEntry)
  }

  /** @returns {number} cantidad de entradas registradas */
  count() {
    return Number(this._db.prepare('SELECT COUNT(*) AS total FROM audit_log').get().total)
  }
}

function toEntry(row) {
  return {
    id: row.id,
    spaceId: row.space_id,
    userId: row.user_id,
    entity: row.entity,
    entityId: row.entity_id,
    action: row.action,
    before: row.before_json ? JSON.parse(row.before_json) : null,
    after: row.after_json ? JSON.parse(row.after_json) : null,
    createdAt: row.created_at
  }
}
