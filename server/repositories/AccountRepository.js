/**
 * Repositorio de cuentas (SPEC-002). Único lugar con SQL de la tabla `accounts`.
 * Sin reglas de negocio: la unicidad y la validación de tipo viven en AccountService.
 */
export class AccountRepository {
  /** @param {import('node:sqlite').DatabaseSync} db conexión */
  constructor(db) {
    this._db = db
  }

  /**
   * Lista las cuentas de un espacio.
   * @param {string} spaceId espacio
   * @param {{ includeArchived?: boolean }} [options] filtros
   * @returns {object[]} cuentas ordenadas por nombre
   */
  listBySpace(spaceId, { includeArchived = false } = {}) {
    const sql = includeArchived
      ? 'SELECT * FROM accounts WHERE space_id = ? ORDER BY name COLLATE NOCASE'
      : 'SELECT * FROM accounts WHERE space_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE'
    return this._db.prepare(sql).all(spaceId).map(toAccount)
  }

  /**
   * Busca una cuenta del espacio por id (aislamiento I-07).
   * @param {string} spaceId espacio @param {string} id cuenta
   * @returns {object|null} cuenta o null
   */
  findById(spaceId, id) {
    const row = this._db.prepare('SELECT * FROM accounts WHERE space_id = ? AND id = ?').get(spaceId, id)
    return row ? toAccount(row) : null
  }

  /**
   * Busca por nombre y moneda dentro del espacio (unicidad de aplicación).
   * @param {string} spaceId espacio @param {string} name nombre @param {string} currency moneda
   * @returns {object|null} cuenta o null
   */
  findByName(spaceId, name, currency) {
    const row = this._db.prepare(
      `SELECT * FROM accounts
        WHERE space_id = ? AND currency = ? AND name = ? COLLATE NOCASE AND archived = 0`
    ).get(spaceId, currency, name)
    return row ? toAccount(row) : null
  }

  /**
   * Crea una cuenta.
   * @param {object} data datos de la cuenta
   * @returns {object} cuenta creada
   */
  create(data) {
    const now = data.now || new Date().toISOString()
    this._db.prepare(
      `INSERT INTO accounts (id, space_id, name, type, currency, opening_balance_cents,
                             archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      data.id,
      data.spaceId,
      data.name,
      data.type,
      data.currency,
      data.openingBalanceCents ?? 0,
      now,
      now
    )
    return this.findById(data.spaceId, data.id)
  }

  /**
   * Actualiza campos editables de una cuenta.
   * @param {string} spaceId espacio @param {string} id cuenta
   * @param {object} changes campos a cambiar
   * @returns {object|null} cuenta actualizada o null si no existe
   */
  update(spaceId, id, changes) {
    const current = this.findById(spaceId, id)
    if (!current) return null
    this._db.prepare(
      `UPDATE accounts
          SET name = ?, type = ?, currency = ?, opening_balance_cents = ?, updated_at = ?
        WHERE space_id = ? AND id = ?`
    ).run(
      changes.name ?? current.name,
      changes.type ?? current.type,
      changes.currency ?? current.currency,
      changes.openingBalanceCents ?? current.openingBalanceCents,
      new Date().toISOString(),
      spaceId,
      id
    )
    return this.findById(spaceId, id)
  }

  /**
   * Archiva o desarchiva una cuenta (I-05: nunca DELETE).
   * @param {string} spaceId espacio @param {string} id cuenta @param {boolean} archived estado
   * @returns {object|null} cuenta actualizada
   */
  setArchived(spaceId, id, archived) {
    this._db.prepare('UPDATE accounts SET archived = ?, updated_at = ? WHERE space_id = ? AND id = ?')
      .run(archived ? 1 : 0, new Date().toISOString(), spaceId, id)
    return this.findById(spaceId, id)
  }

  /**
   * Calcula el saldo actual: saldo inicial + suma de movimientos (no almacenado).
   * Las transferencias suman o restan según sean pata de origen o destino (I-04).
   * @param {string} spaceId espacio @param {string} accountId cuenta
   * @returns {{ openingBalanceCents: number, movementsCents: number, balanceCents: number }}
   */
  calculateBalance(spaceId, accountId) {
    const account = this.findById(spaceId, accountId)
    if (!account) return null
    const movements = Number(this._db.prepare(
      `SELECT COALESCE(SUM(
                 CASE
                   WHEN kind = 'income' THEN amount_base_cents
                   WHEN kind = 'expense' THEN -amount_base_cents
                   WHEN kind = 'transfer' THEN
                     CASE WHEN transfer_direction = 'in' THEN amount_base_cents
                          ELSE -amount_base_cents END
                   ELSE 0
                 END
               ), 0) AS total
           FROM transactions
          WHERE space_id = ? AND account_id = ? AND archived = 0`
    ).get(spaceId, accountId).total)
    return {
      openingBalanceCents: account.openingBalanceCents,
      movementsCents: movements,
      balanceCents: account.openingBalanceCents + movements
    }
  }
}

function toAccount(row) {
  return {
    id: row.id,
    spaceId: row.space_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    openingBalanceCents: Number(row.opening_balance_cents),
    archived: Number(row.archived) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
