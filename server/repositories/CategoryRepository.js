/**
 * Repositorio de categorías (SPEC-003). Único lugar con SQL de la tabla `categories`.
 * Jerarquía de un solo nivel: `parent_id` es NULL o apunta a una categoría raíz del mismo `kind`.
 */
export class CategoryRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Lista categorías de un espacio, con filtro opcional por tipo.
   * @param {string} spaceId espacio
   * @param {{ kind?: string, includeArchived?: boolean }} [options] filtros
   * @returns {object[]} categorías ordenadas por tipo y nombre
   */
  listBySpace(spaceId, { kind, includeArchived = false } = {}) {
    const filters = ['space_id = ?']
    const params = [spaceId]
    if (kind) {
      filters.push('kind = ?')
      params.push(kind)
    }
    if (!includeArchived) filters.push('archived = 0')
    const rows = this._db.prepare(
      `SELECT * FROM categories WHERE ${filters.join(' AND ')} ORDER BY kind, name COLLATE NOCASE`
    ).all(...params)
    return rows.map(toCategory)
  }

  /**
   * Busca una categoría del espacio por id (aislamiento I-07).
   * @param {string} spaceId espacio @param {string} id categoría
   * @returns {object|null} categoría o null
   */
  findById(spaceId, id) {
    const row = this._db.prepare('SELECT * FROM categories WHERE space_id = ? AND id = ?').get(spaceId, id)
    return row ? toCategory(row) : null
  }

  /**
   * Busca por nombre y tipo dentro del espacio (refleja UNIQUE(space_id, kind, name)).
   * @param {string} spaceId espacio @param {string} name nombre @param {string} kind tipo
   * @returns {object|null} categoría o null
   */
  findByName(spaceId, name, kind) {
    const row = this._db.prepare(
      'SELECT * FROM categories WHERE space_id = ? AND kind = ? AND name = ? COLLATE NOCASE'
    ).get(spaceId, kind, name)
    return row ? toCategory(row) : null
  }

  /**
   * Cuenta las hijas de una categoría (para no romper la jerarquía al archivar).
   * @param {string} spaceId espacio @param {string} parentId padre
   * @returns {number} cantidad de hijas activas
   */
  countChildren(spaceId, parentId) {
    return Number(this._db.prepare(
      'SELECT COUNT(*) AS total FROM categories WHERE space_id = ? AND parent_id = ? AND archived = 0'
    ).get(spaceId, parentId).total)
  }

  /**
   * Crea una categoría.
   * @param {object} data datos
   * @returns {object} categoría creada
   */
  create(data) {
    const now = data.now || new Date().toISOString()
    this._db.prepare(
      `INSERT INTO categories (id, space_id, name, kind, parent_id, color, icon, archived,
                               created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      data.id,
      data.spaceId,
      data.name,
      data.kind,
      data.parentId || null,
      data.color || null,
      data.icon || null,
      now,
      now
    )
    return this.findById(data.spaceId, data.id)
  }

  /**
   * Actualiza campos editables.
   * @param {string} spaceId espacio @param {string} id categoría @param {object} changes cambios
   * @returns {object|null} categoría actualizada
   */
  update(spaceId, id, changes) {
    const current = this.findById(spaceId, id)
    if (!current) return null
    this._db.prepare(
      `UPDATE categories
          SET name = ?, kind = ?, parent_id = ?, color = ?, icon = ?, updated_at = ?
        WHERE space_id = ? AND id = ?`
    ).run(
      changes.name ?? current.name,
      changes.kind ?? current.kind,
      changes.parentId !== undefined ? changes.parentId : current.parentId,
      changes.color !== undefined ? changes.color : current.color,
      changes.icon !== undefined ? changes.icon : current.icon,
      new Date().toISOString(),
      spaceId,
      id
    )
    return this.findById(spaceId, id)
  }

  /**
   * Archiva o desarchiva (I-05).
   * @param {string} spaceId espacio @param {string} id categoría @param {boolean} archived estado
   * @returns {object|null} categoría actualizada
   */
  setArchived(spaceId, id, archived) {
    this._db.prepare('UPDATE categories SET archived = ?, updated_at = ? WHERE space_id = ? AND id = ?')
      .run(archived ? 1 : 0, new Date().toISOString(), spaceId, id)
    return this.findById(spaceId, id)
  }

  /**
   * Elimina físicamente una categoría (solo si no tiene dependencias; lo verifica el Service).
   * @param {string} spaceId espacio @param {string} id categoría
   * @returns {number} filas borradas
   */
  delete(spaceId, id) {
    return this._db.prepare('DELETE FROM categories WHERE space_id = ? AND id = ?').run(spaceId, id).changes
  }

  /**
   * Cuenta transacciones asociadas a una categoría (bloquea borrado y cambio de tipo).
   * @param {string} spaceId espacio @param {string} categoryId categoría
   * @returns {number} cantidad de transacciones
   */
  countTransactions(spaceId, categoryId) {
    return Number(this._db.prepare(
      'SELECT COUNT(*) AS total FROM transactions WHERE space_id = ? AND category_id = ?'
    ).get(spaceId, categoryId).total)
  }

  /**
   * Cuenta presupuestos asociados (SPEC-006).
   * @param {string} spaceId espacio @param {string} categoryId categoría
   * @returns {number} cantidad de presupuestos
   */
  countBudgets(spaceId, categoryId) {
    return Number(this._db.prepare(
      'SELECT COUNT(*) AS total FROM budgets WHERE space_id = ? AND category_id = ?'
    ).get(spaceId, categoryId).total)
  }
}

function toCategory(row) {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    color: row.color,
    icon: row.icon,
    archived: Number(row.archived) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
