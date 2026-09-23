import { randomUUID } from 'node:crypto'
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js'
import { assertCents, assertCurrency } from '../utils/money.js'

/** Tipos de cuenta permitidos (AGENT.md §6.1). */
export const ACCOUNT_TYPES = ['cash', 'debit', 'credit']

/** Tipos que admiten saldo inicial negativo (SPEC-002 §5.2: solo crédito). */
const TYPES_ALLOWING_NEGATIVE_OPENING = ['credit']

/**
 * Servicio de cuentas (SPEC-002).
 * Reglas de negocio: validación de tipo y moneda, saldo inicial negativo solo en
 * crédito, unicidad de nombre+moneda por espacio (409, no UNIQUE en BD) y
 * archivado lógico (I-05).
 */
export class AccountService {
  /**
   * @param {object} deps dependencias
   * @param {import('../repositories/AccountRepository.js').AccountRepository} deps.accountRepository
   * @param {import('../repositories/AuditRepository.js').AuditRepository} deps.auditRepository
   */
  constructor({ accountRepository, auditRepository }) {
    this._accounts = accountRepository
    this._audit = auditRepository
  }

  /**
   * Crea una cuenta en el espacio del dueño.
   * @param {{ spaceId: string, userId?: string, name: string, type: string,
   *           currency: string, openingBalanceCents?: number }} input datos
   * @returns {object} cuenta creada con su saldo
   * @throws {ValidationError|ConflictError}
   */
  create({ spaceId, userId = null, name, type, currency, openingBalanceCents = 0 }) {
    const cleanName = String(name || '').trim()
    if (!cleanName) throw new ValidationError('El nombre de la cuenta es obligatorio')

    const cleanType = String(type || '').trim().toLowerCase()
    if (!ACCOUNT_TYPES.includes(cleanType)) {
      throw new ValidationError(`Tipo de cuenta inválido: debe ser ${ACCOUNT_TYPES.join(', ')}`)
    }

    const cleanCurrency = validateCurrency(currency)
    const opening = validateOpeningBalance(cleanType, openingBalanceCents)

    if (this._accounts.findByName(spaceId, cleanName, cleanCurrency)) {
      throw new ConflictError(`Ya existe una cuenta "${cleanName}" en ${cleanCurrency} en este espacio`)
    }

    const account = this._accounts.create({
      id: randomUUID(),
      spaceId,
      name: cleanName,
      type: cleanType,
      currency: cleanCurrency,
      openingBalanceCents: opening
    })

    this._audit.record({
      entity: 'accounts',
      entityId: account.id,
      action: 'create',
      after: account,
      spaceId,
      userId
    })

    return this.toPublic(account, spaceId)
  }

  /**
   * Lista las cuentas del espacio con saldo calculado (AC-05).
   * @param {string} spaceId espacio
   * @param {{ includeArchived?: boolean }} [options] filtros
   * @returns {object[]} cuentas con saldo
   */
  list(spaceId, { includeArchived = false } = {}) {
    return this._accounts
      .listBySpace(spaceId, { includeArchived })
      .map((account) => this.toPublic(account, spaceId))
  }

  /**
   * Obtiene una cuenta del espacio (404 si es de otro espacio, I-07).
   * @param {string} spaceId espacio @param {string} id cuenta
   * @returns {object} cuenta con saldo
   * @throws {NotFoundError}
   */
  get(spaceId, id) {
    const account = this._accounts.findById(spaceId, id)
    if (!account) throw new NotFoundError('Cuenta no encontrada')
    return this.toPublic(account, spaceId)
  }


  /**
   * Edita una cuenta. No permite cambiar la moneda si ya tiene movimientos.
   * @param {{ spaceId: string, userId?: string, id: string, changes: object }} input datos
   * @returns {object} cuenta actualizada
   * @throws {NotFoundError|ValidationError|ConflictError}
   */
  update({ spaceId, userId = null, id, changes }) {
    const current = this._accounts.findById(spaceId, id)
    if (!current) throw new NotFoundError('Cuenta no encontrada')

    const patch = {}
    if (changes.name !== undefined) {
      const cleanName = String(changes.name).trim()
      if (!cleanName) throw new ValidationError('El nombre de la cuenta es obligatorio')
      patch.name = cleanName
    }
    if (changes.type !== undefined) {
      const cleanType = String(changes.type).trim().toLowerCase()
      if (!ACCOUNT_TYPES.includes(cleanType)) {
        throw new ValidationError(`Tipo de cuenta inválido: debe ser ${ACCOUNT_TYPES.join(', ')}`)
      }
      patch.type = cleanType
    }
    if (changes.currency !== undefined) {
      const cleanCurrency = validateCurrency(changes.currency)
      const balance = this._accounts.calculateBalance(spaceId, id)
      if (cleanCurrency !== current.currency && balance && balance.movementsCents !== 0) {
        throw new ConflictError('No se puede cambiar la moneda de una cuenta con movimientos')
      }
      patch.currency = cleanCurrency
    }
    if (changes.openingBalanceCents !== undefined) {
      patch.openingBalanceCents = validateOpeningBalance(
        patch.type || current.type,
        changes.openingBalanceCents
      )
    }

    const nameChanged = patch.name && patch.name.toLowerCase() !== current.name.toLowerCase()
    const currencyChanged = patch.currency && patch.currency !== current.currency
    if (nameChanged || currencyChanged) {
      const duplicate = this._accounts.findByName(
        spaceId,
        patch.name || current.name,
        patch.currency || current.currency
      )
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('Ya existe una cuenta con ese nombre y moneda en este espacio')
      }
    }

    const updated = this._accounts.update(spaceId, id, patch)
    this._audit.record({
      entity: 'accounts',
      entityId: id,
      action: 'update',
      before: current,
      after: updated,
      spaceId,
      userId
    })
    return this.toPublic(updated, spaceId)
  }

  /**
   * Archiva lógicamente una cuenta (AC-06).
   * @param {{ spaceId: string, userId?: string, id: string }} input datos
   * @returns {object} cuenta archivada
   * @throws {NotFoundError}
   */
  archive({ spaceId, userId = null, id }) {
    const current = this._accounts.findById(spaceId, id)
    if (!current) throw new NotFoundError('Cuenta no encontrada')
    const updated = this._accounts.setArchived(spaceId, id, true)
    this._audit.record({
      entity: 'accounts',
      entityId: id,
      action: 'archive',
      before: current,
      after: updated,
      spaceId,
      userId
    })
    return this.toPublic(updated, spaceId)
  }

  /**
   * Desarchiva una cuenta.
   * @param {{ spaceId: string, userId?: string, id: string }} input datos
   * @returns {object} cuenta activa
   * @throws {NotFoundError}
   */
  unarchive({ spaceId, userId = null, id }) {
    const current = this._accounts.findById(spaceId, id)
    if (!current) throw new NotFoundError('Cuenta no encontrada')
    const updated = this._accounts.setArchived(spaceId, id, false)
    this._audit.record({
      entity: 'accounts',
      entityId: id,
      action: 'unarchive',
      before: current,
      after: updated,
      spaceId,
      userId
    })
    return this.toPublic(updated, spaceId)
  }

  /**
   * Verifica que una cuenta exista, sea del espacio y esté activa (AC-09/AC-10).
   * Lo consumen SPEC-004 y SPEC-007.
   * @param {string} spaceId espacio @param {string} accountId cuenta
   * @returns {object} cuenta activa
   * @throws {NotFoundError|ConflictError}
   */
  assertUsable(spaceId, accountId) {
    const account = this._accounts.findById(spaceId, accountId)
    if (!account) throw new NotFoundError('Cuenta no encontrada')
    if (account.archived) throw new ConflictError('La cuenta está archivada y no admite movimientos')
    return account
  }

  /**
   * Proyecta una cuenta para el cliente con su saldo calculado (no almacenado).
   * @param {object} account cuenta @param {string} spaceId espacio
   * @returns {object} representación pública
   */
  toPublic(account, spaceId) {
    const balance = this._accounts.calculateBalance(spaceId, account.id) || {
      openingBalanceCents: account.openingBalanceCents,
      movementsCents: 0,
      balanceCents: account.openingBalanceCents
    }
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      openingBalanceCents: account.openingBalanceCents,
      movementsCents: balance.movementsCents,
      balanceCents: balance.balanceCents,
      archived: account.archived,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }
  }
}

/** Valida la moneda contra el canónico GTQ/USD. @throws {ValidationError} */
function validateCurrency(currency) {
  try {
    return assertCurrency(currency)
  } catch (error) {
    throw new ValidationError(error.message)
  }
}

/** Valida el saldo inicial: entero en centavos; negativo solo en crédito. @throws {ValidationError} */
function validateOpeningBalance(type, openingBalanceCents) {
  let cents
  try {
    cents = assertCents(openingBalanceCents ?? 0)
  } catch (error) {
    throw new ValidationError(error.message)
  }
  if (cents < 0 && !TYPES_ALLOWING_NEGATIVE_OPENING.includes(type)) {
    throw new ValidationError('Solo una cuenta de crédito admite saldo inicial negativo')
  }
  return cents
}
