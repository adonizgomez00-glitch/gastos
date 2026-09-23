/**
 * Repositorio de transacciones (SPEC-004). Único lugar con SQL de la tabla `transactions`.
 * La tabla se crea en la migración 005 junto con `audit_log` y `budgets`.
 */
export class TransactionRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Lista transacciones del espacio con filtros y paginación (AC-19).
   * @param {string} spaceId espacio
   * @param {object} [filters] `{ from?, to?, accountId?, categoryId?, kind?, includeArchived?, limit?, offset? }`
   * @returns {object[]} transacciones ordenadas por `occurred_on` descendente
   */
  list(spaceId, { from, to, accountId, categoryId, kind, includeArchived = false, limit = 100, offset = 0 } = {}) {
    const conditions = ['space_id = ?']
    const params = [spaceId]
    if (from) { conditions.push('occurred_on >= ?'); params.push(from) }
    if (to) { conditions.push('occurred_on <= ?'); params.push(to) }
    if (accountId) { conditions.push('account_id = ?'); params.push(accountId) }
    if (categoryId) { conditions.push('category_id = ?'); params.push(categoryId) }
    if (kind) { conditions.push('kind = ?'); params.push(kind) }
    if (!includeArchived) conditions.push('archived = 0')

    const sql = `SELECT * FROM transactions
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY occurred_on DESC, created_at DESC
                 LIMIT ? OFFSET ?`
    return this._db.prepare(sql).all(...params, limit, offset).map(toTransaction)
  }

  /**
   * Busca una transacción del espacio por id (404 si de otro espacio, I-07).
   * @param {string} spaceId espacio @param {string} id transacción
   * @returns {object|null} transacción o null
   */
  findById(spaceId, id) {
    const row = this._db.prepare(
      'SELECT * FROM transactions WHERE space_id = ? AND id = ?'
    ).get(spaceId, id)
    return row ? toTransaction(row) : null
  }


  /**
   * Inserta una transacción.
   * @param {object} data datos
   * @returns {object} transacción creada
   */
  create(data) {
    const now = data.now || new Date().toISOString()
    this._db.prepare(
      `INSERT INTO transactions (id, space_id, account_id, category_id, kind,
         amount_cents, currency, fx_rate_micro, amount_base_cents, rate_date, rate_source,
         occurred_on, description, notes, transfer_group_id, transfer_direction, refund_of,
         archived, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    ).run(
      data.id, data.spaceId, data.accountId, data.categoryId || null, data.kind,
      data.amountCents, data.currency, data.fxRateMicro || null, data.amountBaseCents,
      data.rateDate || null, data.rateSource || null, data.occurredOn, data.description,
      data.notes || null, data.transferGroupId || null, data.transferDirection || null,
      data.refundOf || null, data.createdBy, now, now
    )
    return this.findById(data.spaceId, data.id)
  }

  /**
   * Actualiza campos editables de una transacción (sin tocar la tasa cuando no corresponde).
   * @param {string} spaceId espacio @param {string} id transacción @param {object} changes cambios
   * @returns {object|null} transacción actualizada
   */
  update(spaceId, id, changes) {
    const current = this.findById(spaceId, id)
    if (!current) return null
    this._db.prepare(
      `UPDATE transactions
          SET category_id = ?, description = ?, notes = ?, occurred_on = ?,
              amount_cents = ?, currency = ?, fx_rate_micro = ?, amount_base_cents = ?,
              rate_date = ?, rate_source = ?, updated_at = ?
        WHERE space_id = ? AND id = ?`
    ).run(
      changes.categoryId !== undefined ? changes.categoryId : current.categoryId,
      changes.description ?? current.description,
      changes.notes !== undefined ? changes.notes : current.notes,
      changes.occurredOn ?? current.occurredOn,
      changes.amountCents ?? current.amountCents,
      changes.currency ?? current.currency,
      changes.fxRateMicro !== undefined ? changes.fxRateMicro : current.fxRateMicro,
      changes.amountBaseCents !== undefined ? changes.amountBaseCents : current.amountBaseCents,
      changes.rateDate !== undefined ? changes.rateDate : current.rateDate,
      changes.rateSource !== undefined ? changes.rateSource : current.rateSource,
      new Date().toISOString(),
      spaceId, id
    )
    return this.findById(spaceId, id)
  }

  /**
   * Archiva lógicamente (I-05: nunca DELETE de transacciones con historial).
   * @param {string} spaceId espacio @param {string} id transacción
   * @returns {object|null} transacción archivada
   */
  archive(spaceId, id) {
    this._db.prepare(
      'UPDATE transactions SET archived = 1, updated_at = ? WHERE space_id = ? AND id = ?'
    ).run(new Date().toISOString(), spaceId, id)
    return this.findById(spaceId, id)
  }

  /**
   * Suma de `amount_base_cents` agrupada por categoría (AC-17).
   * @param {string} spaceId espacio @param {number} year @param {number} month (1-12)
   * @returns {{ byCategory: Array<{categoryId: string|null, total: number}>, total: number }}
   */
  sumByCategory(spaceId, year, month) {
    const rows = this._db.prepare(
      `SELECT category_id AS categoryId, SUM(amount_base_cents) AS total
         FROM transactions
        WHERE space_id = ? AND kind = 'expense' AND archived = 0
          AND CAST(strftime('%Y', occurred_on) AS INTEGER) = ?
          AND CAST(strftime('%m', occurred_on) AS INTEGER) = ?
        GROUP BY category_id`
    ).all(spaceId, year, month)

    const byCategory = rows.map((row) => ({ categoryId: row.categoryId, total: Number(row.total) }))
    const total = byCategory.reduce((sum, row) => sum + row.total, 0)
    return { byCategory, total }
  }

  /**
   * Cuenta movimientos de una categoría (usado en tests y futuras specs).
   * @param {string} spaceId espacio @param {string|null} categoryId categoría
   * @returns {number} cantidad
   */
  countByCategory(spaceId, categoryId) {
    return Number(this._db.prepare(
      'SELECT COUNT(*) AS total FROM transactions WHERE space_id = ? AND category_id IS NOT DISTINCT FROM ? AND archived = 0'
    ).get(spaceId, categoryId ?? null).total)
  }
}

function toTransaction(row) {
  return {
    id: row.id,
    spaceId: row.space_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    kind: row.kind,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    fxRateMicro: row.fx_rate_micro !== null && row.fx_rate_micro !== undefined
      ? Number(row.fx_rate_micro) : null,
    amountBaseCents: Number(row.amount_base_cents),
    rateDate: row.rate_date,
    rateSource: row.rate_source,
    occurredOn: row.occurred_on,
    description: row.description,
    notes: row.notes,
    transferGroupId: row.transfer_group_id,
    refundOf: row.refund_of,
    archived: Number(row.archived) === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

