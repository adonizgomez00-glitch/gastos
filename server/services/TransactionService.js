import { randomUUID } from 'node:crypto'
import { AppError, NotFoundError } from '../utils/errors.js'
import { assertCents, assertCurrency, divideRoundHalfUp, convertCents } from '../utils/money.js'
import { withTransaction } from '../database/sqlite.js'
import { SUPPORTED_PAIR } from './RateService.js'

/** Kinds admitidos por SPEC-004 §4.1 (expense/income). Transferencias son SPEC-005. */
export const TRANSACTION_KINDS = ['expense', 'income']

/** Moneda base del sistema. Las tasas se resuelven contra ella. */
const BASE_CURRENCY = 'GTQ'

/** Escala de tasas en micro unidades (I-02). */
const RATE_SCALE = 1_000_000

/** Lanza un error 422 con codigo de negocio (AGENT.md §9.4). */
function validationError(message, code) {
  return new AppError(message, { status: 422, code })
}

/**
 * Servicio de transacciones (SPEC-004).
 *
 * Reglas de negocio:
 * - Todo monto monetario vive en centavos enteros (I-01); validacion en money.js.
 * - La tasa se congela al crear/editar (I-03). Si el monto o la moneda cambian en un
 *   PATCH, se re-resuelve la tasa; si no, se conserva la tasa original y se audita igual.
 * - `refund` crea una transaccion inversa (kind opuesto, mismo monto) enlazada por
 *   `refundOf` (AC-15). La original se archiva.
 * - Transacciones atomicas: BEGIN -> INSERT transaction + audit_log -> COMMIT (I-10).
 * - Aislamiento por espacio: 404 (no 403) cuando la transaccion no pertenece al
 *   espacio (I-07).
 */
export class TransactionService {
  /**
   * @param {object} deps
   * @param {import('node:sqlite').DatabaseSync} deps.db conexión para transacciones atómicas
   * @param {import('../repositories/TransactionRepository.js').TransactionRepository} deps.transactionRepository
   * @param {import('../repositories/AccountRepository.js').AccountRepository} deps.accountRepository
   * @param {import('../repositories/CategoryRepository.js').CategoryRepository} deps.categoryRepository
   * @param {import('../repositories/AuditRepository.js').AuditRepository} deps.auditRepository
   * @param {import('./RateService.js').RateService} deps.rateService
   */
  constructor({ db, transactionRepository, accountRepository, categoryRepository, auditRepository, rateService }) {
    this._db = db
    this._transactions = transactionRepository
    this._accounts = accountRepository
    this._categories = categoryRepository
    this._audit = auditRepository
    this._rateService = rateService
  }

  /**
   * Lista transacciones del espacio con filtros (AC-19).
   */
  list({ spaceId, from, to, accountId, categoryId, kind, includeArchived, limit, offset }) {
    return this._transactions.list(spaceId, { from, to, accountId, categoryId, kind, includeArchived, limit, offset })
  }

  /**
   * Crea una transaccion. Congela la tasa al momento (I-03, AC-02, AC-03).
   * @param {object} input `{ spaceId, userId, kind, accountId, categoryId, amountCents, currency, occurredOn, description, notes }`
   * @returns {Promise<object>} transaccion completa
   * @throws {ValidationError|NotFoundError}
   */
  async create(input) {
    const spaceId = input.spaceId
    const userId = input.userId || null

    const kind = validateKind(input.kind)
    const amountCents = validateAmount(input.amountCents)
    const currency = validateCurrency(input.currency)
    const occurredOn = validateOccurredOn(input.occurredOn)
    const description = validateDescription(input.description)
    const notes = validateNotes(input.notes)

    const account = await this._accounts.findById(spaceId, input.accountId)
    if (!account) throw new NotFoundError('La cuenta seleccionada no existe en este espacio')
    if (account.archived) throw validationError('La cuenta esta archivada; active la cuenta para registrar movimientos', 'ACCOUNT_ARCHIVED')

    const category = input.categoryId
      ? await this._categories.findById(spaceId, input.categoryId)
      : null
    if (input.categoryId && !category) {
      throw new NotFoundError('La categoria seleccionada no existe en este espacio')
    }
    if (category && category.kind !== kind) {
      throw validationError(`La categoria "${category.name}" es de tipo ${category.kind} y no acepta ${kind}`, 'CATEGORY_KIND_MISMATCH')
    }

    // Conversion con tasa congelada (I-02, I-03, AC-05).
    const conversion = await this._convert(amountCents, currency, occurredOn)

    const txn = this._transactions.create({
      id: randomUUID(),
      spaceId,
      accountId: account.id,
      categoryId: category?.id || null,
      kind,
      amountCents,
      currency,
      fxRateMicro: conversion.fxRateMicro,
      amountBaseCents: conversion.amountBaseCents,
      rateDate: conversion.rateDate,
      rateSource: conversion.rateSource,
      occurredOn,
      description,
      notes,
      transferGroupId: null,
      transferDirection: null,
      refundOf: null,
      createdBy: userId,
      now: conversion.now
    })

    await this._audit.record({
      spaceId,
      userId,
      entity: 'transactions',
      entityId: txn.id,
      action: 'create',
      after: txn
    })

    return txn
  }

  /**
   * Actualiza una transaccion. Reconge la tasa SOLO si cambia monto o moneda (AC-13).
   */
  async update(spaceId, txnId, input, userId = null) {
    const current = this._transactions.findById(spaceId, txnId)
    if (!current) throw new NotFoundError('La transaccion no existe en este espacio')

    const changes = { description: input.description ?? null }
    if (input.notes !== undefined) changes.notes = input.notes
    if (input.categoryId !== undefined) {
      const category = input.categoryId
        ? await this._categories.findById(spaceId, input.categoryId)
        : null
      if (input.categoryId && !category) {
        throw new NotFoundError('La categoria seleccionada no existe en este espacio')
      }
      if (category && category.kind !== current.kind) {
        throw validationError(`La categoria "${category.name}" es de tipo ${category.kind} y no acepta ${current.kind}`, 'CATEGORY_KIND_MISMATCH')
      }
      changes.categoryId = category?.id || null
    }
    if (input.occurredOn !== undefined) changes.occurredOn = validateOccurredOn(input.occurredOn)
    if (input.kind !== undefined) throw validationError('No se puede cambiar el tipo de una transaccion existente', 'INVALID_KIND_CHANGE')

    const amountChanged = input.amountCents !== undefined
    const currencyChanged = input.currency !== undefined
    if (currencyChanged && !SUPPORTED_PAIR.includes(String(input.currency || '').toUpperCase())) {
      throw validationError(`Moneda no soportada: ${input.currency}`, 'UNSUPPORTED_CURRENCY')
    }

    if (amountChanged || currencyChanged) {
      const newAmount = validateAmount(input.amountCents ?? current.amountCents)
      const newCurrency = validateCurrency(input.currency ?? current.currency)
      const occurredOn = changes.occurredOn || current.occurredOn
      const conversion = await this._convert(newAmount, newCurrency, occurredOn)
      changes.amountCents = newAmount
      changes.currency = newCurrency
      changes.fxRateMicro = conversion.fxRateMicro
      changes.amountBaseCents = conversion.amountBaseCents
      changes.rateDate = conversion.rateDate
      changes.rateSource = conversion.rateSource
    }

    const updated = this._transactions.update(spaceId, txnId, changes)

    await this._audit.record({
      spaceId,
      userId,
      entity: 'transactions',
      entityId: txnId,
      action: 'update',
      before: current,
      after: updated
    })

    return updated
  }

  /**
   * Archiva logicmente una transaccion (AC-14, I-05).
   */
  async archive(spaceId, txnId, userId = null) {
    const current = this._transactions.findById(spaceId, txnId)
    if (!current) throw new NotFoundError('La transaccion no existe en este espacio')
    if (current.archived) return current

    const archived = this._transactions.archive(spaceId, txnId)
    await this._audit.record({
      spaceId,
      userId,
      entity: 'transactions',
      entityId: txnId,
      action: 'archive',
      before: current,
      after: archived
    })
    return archived
  }

  /**
   * Reembolso: crea una transaccion inversa y archiva la original (AC-15).
   * @param {object} input `{ spaceId, txnId, userId }`
   * @returns {Promise<object>} la transaccion inversa creada
   */
  async refund(spaceId, txnId, userId = null) {
    const current = this._transactions.findById(spaceId, txnId)
    if (!current) throw new NotFoundError('La transaccion no existe en este espacio')
    if (current.archived) throw validationError('No se puede reembolsar una transaccion archivada', 'TRANSACTION_ARCHIVED')

    const inverseKind = current.kind === 'expense' ? 'income' : 'expense'
    const refundId = randomUUID()
    const now = new Date().toISOString()

    const inverse = this._transactions.create({
      id: refundId,
      spaceId,
      accountId: current.accountId,
      categoryId: current.categoryId,
      kind: inverseKind,
      amountCents: current.amountCents,
      currency: current.currency,
      fxRateMicro: current.fxRateMicro,
      amountBaseCents: current.amountBaseCents,
      rateDate: current.rateDate,
      rateSource: current.rateSource,
      occurredOn: current.occurredOn,
      description: `Reembolso: ${current.description || ''}`.trim().replace(/^Reembolso: $/, 'Reembolso'),
      notes: current.notes ? `Reembolso de #${current.id}: ${current.notes}` : `Reembolso de #${current.id}`,
      refundOf: current.id,
      createdBy: userId,
      now
    })

    await this._transactions.archive(spaceId, txnId)

    await this._audit.record({ spaceId, userId, entity: 'transactions', entityId: refundId, action: 'refund', after: inverse })
    await this._audit.record({ spaceId, userId, entity: 'transactions', entityId: txnId, action: 'archive', before: current, after: { ...current, archived: true } })

    return inverse
  }

  /**
   * Suma por categoria del mes (AC-17). Verifica invariante financiera.
   */
  sumByCategory(spaceId, year, month) {
    return this._transactions.sumByCategory(spaceId, year, month)
  }

  /**
   * Crea una transferencia de dos patas enlazadas (SPEC-005).
   * Ambas patas comparten `transfer_group_id` y el mismo `amount_base_cents` (I-04).
   * @param {object} input `{ spaceId, userId, fromAccountId, toAccountId, amountCents, currency?, occurredOn?, note? }`
   * @returns {Promise<{transferGroupId: string, legs: object[]}>}
   */
  async createTransfer({ spaceId, userId = null, fromAccountId, toAccountId, amountCents, currency, occurredOn, note }) {
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      throw validationError('La cuenta de origen y la de destino deben ser distintas', 'SAME_ACCOUNT')
    }

    const from = await this._accounts.findById(spaceId, fromAccountId)
    if (!from) throw new NotFoundError('La cuenta de origen no existe en este espacio')
    if (from.archived) {
      throw validationError('La cuenta de origen esta archivada', 'ACCOUNT_ARCHIVED')
    }

    const to = await this._accounts.findById(spaceId, toAccountId)
    if (!to) throw new NotFoundError('La cuenta de destino no existe en este espacio')
    if (to.archived) {
      throw validationError('La cuenta de destino esta archivada', 'ACCOUNT_ARCHIVED')
    }

    const amount = validateAmount(amountCents)
    const date = validateOccurredOn(occurredOn || todayBusinessDate())
    const notes = note === undefined ? null : validateNotes(note)

    const fromCurrency = from.currency
    const toCurrency = to.currency
    if (currency !== undefined && currency !== null && currency !== '') {
      const requested = validateCurrency(currency)
      if (requested !== fromCurrency) {
        throw validationError(
          `La moneda debe ser la de la cuenta de origen (${fromCurrency})`,
          'CURRENCY_MISMATCH'
        )
      }
    }

    const groupId = randomUUID()
    const rateFields = await this._transferRateFields({
      amount,
      fromCurrency,
      toCurrency,
      occurredOn: date
    })

    // Monto en la moneda de cada pata; amount_base_cents idéntico en ambas (I-04).
    let fromAmount
    let toAmount
    let amountBaseCents
    if (fromCurrency === toCurrency) {
      fromAmount = amount
      toAmount = amount
      amountBaseCents = rateFields.fxRateMicro === null
        ? amount
        : convertCents(amount, rateFields.fxRateMicro)
    } else if (fromCurrency === BASE_CURRENCY) {
      // GTQ → USD: base = monto origen; destino en USD con la tasa congelada.
      fromAmount = amount
      amountBaseCents = amount
      toAmount = divideRoundHalfUp(amount * RATE_SCALE, rateFields.fxRateMicro)
    } else {
      // USD → GTQ: base = conversión del origen; destino recibe el mismo valor base.
      fromAmount = amount
      amountBaseCents = convertCents(amount, rateFields.fxRateMicro)
      toAmount = amountBaseCents
    }

    const now = new Date().toISOString()
    const baseLeg = {
      spaceId,
      kind: 'transfer',
      categoryId: null,
      amountBaseCents,
      rateDate: rateFields.rateDate,
      rateSource: rateFields.rateSource,
      fxRateMicro: rateFields.fxRateMicro,
      occurredOn: date,
      description: '',
      notes,
      transferGroupId: groupId,
      refundOf: null,
      createdBy: userId,
      now
    }

    return withTransaction(this._db, () => {
      const origin = this._transactions.create({
        ...baseLeg,
        id: randomUUID(),
        accountId: from.id,
        amountCents: fromAmount,
        currency: fromCurrency,
        transferDirection: 'out'
      })
      const destination = this._transactions.create({
        ...baseLeg,
        id: randomUUID(),
        accountId: to.id,
        amountCents: toAmount,
        currency: toCurrency,
        transferDirection: 'in'
      })

      this._audit.record({
        spaceId, userId, entity: 'transactions', entityId: origin.id,
        action: 'create', after: origin
      })
      this._audit.record({
        spaceId, userId, entity: 'transactions', entityId: destination.id,
        action: 'create', after: destination
      })

      return { transferGroupId: groupId, legs: [origin, destination] }
    })
  }

  /**
   * Lista transferencias agrupadas por `transferGroupId` (AC-11).
   * @param {object} input `{ spaceId, from?, to? }`
   * @returns {Array<{transferGroupId: string, legs: object[]}>}
   */
  listTransfers({ spaceId, from, to }) {
    const rows = this._transactions.listTransfers(spaceId, { from, to })
    const groups = new Map()
    for (const leg of rows) {
      const key = leg.transferGroupId
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(leg)
    }
    return [...groups.entries()].map(([transferGroupId, legs]) => ({ transferGroupId, legs }))
  }

  /**
   * Borra ambas patas de una transferencia en una sola transacción (AC-12).
   * @param {object} input `{ spaceId, userId?, groupId }`
   * @returns {{ deleted: true, transferGroupId: string, legsRemoved: number }}
   */
  deleteTransfer({ spaceId, userId = null, groupId }) {
    const legs = this._transactions.findByTransferGroup(spaceId, groupId)
    if (legs.length === 0) {
      throw new NotFoundError('La transferencia no existe en este espacio')
    }

    return withTransaction(this._db, () => {
      for (const leg of legs) {
        this._audit.record({
          spaceId, userId, entity: 'transactions', entityId: leg.id,
          action: 'delete', before: leg, after: null
        })
      }
      const removed = this._transactions.deleteByTransferGroup(spaceId, groupId)
      return { deleted: true, transferGroupId: groupId, legsRemoved: removed }
    })
  }

  /**
   * Resuelve los campos de tasa congelada para una transferencia (I-03).
   * Misma moneda GTQ→GTQ no consulta tasa; el resto exige tasa o rechaza.
   */
  async _transferRateFields({ amount, fromCurrency, toCurrency, occurredOn }) {
    if (fromCurrency === toCurrency && fromCurrency === BASE_CURRENCY) {
      return { fxRateMicro: null, rateDate: null, rateSource: null }
    }
    if (fromCurrency === toCurrency) {
      // Misma moneda no base (USD→USD): se necesita tasa para amount_base_cents.
      const rate = await this._rateService.requireRate({
        baseCurrency: fromCurrency,
        quoteCurrency: BASE_CURRENCY,
        rateDate: occurredOn,
        allowFetch: true
      })
      return {
        fxRateMicro: Number(rate.rateMicro),
        rateDate: rate.rateDate || occurredOn,
        rateSource: rate.source
      }
    }
    // Monedas distintas: par USD/GTQ (único soportado con conversión).
    const [nonBase] = [fromCurrency, toCurrency].filter((c) => c !== BASE_CURRENCY)
    const rate = await this._rateService.requireRate({
      baseCurrency: nonBase,
      quoteCurrency: BASE_CURRENCY,
      rateDate: occurredOn,
      allowFetch: true
    })
    return {
      fxRateMicro: Number(rate.rateMicro),
      rateDate: rate.rateDate || occurredOn,
      rateSource: rate.source
    }
  }

  /**
   * Resuelve la tasa solo cuando la moneda es distinta a la base (AC-02, AC-03, AC-05).
   * Para GTQ (base) no consulta nada y deja los campos nulos (AC-02).
   *
   * Convencion (fx.js): `1 baseCurrency = X quoteCurrency`.
   * Para convertir USD a GTQ se necesita `1 USD = X GTQ`; por eso el quoteCurrency
   * es GTQ (base del sistema) y el rateMicro sera `X * 1_000_000` centavos GTQ por
   * 1_000_000 USD.
   */
  async _convert(amountCents, currency, occurredOn) {
    const now = new Date().toISOString()
    if (currency === BASE_CURRENCY) {
      return { fxRateMicro: null, amountBaseCents: amountCents, rateDate: null, rateSource: null, now }
    }

    const rate = await this._rateService.requireRate({
      baseCurrency: currency,
      quoteCurrency: BASE_CURRENCY,
      rateDate: occurredOn,
      allowFetch: true
    })

    // amountBaseCents = amountCents * rateMicro / 1_000_000 (redondeo half-up, I-02)
    const amountBaseCents = Math.trunc((amountCents * rate.rateMicro + 500_000) / 1_000_000)
    return {
      fxRateMicro: Number(rate.rateMicro),
      amountBaseCents,
      rateDate: rate.rateDate || occurredOn,
      rateSource: rate.source,
      now
    }
  }
}

export function validateKind(value) {
  const clean = String(value || '').trim().toLowerCase()
  if (!TRANSACTION_KINDS.includes(clean)) {
    throw validationError(`Tipo de transaccion invalido: debe ser ${TRANSACTION_KINDS.join(' o ')}`, 'INVALID_KIND')
  }
  return clean
}

export function validateAmount(value) {
  let n
  try { n = assertCents(value) } catch { throw validationError('El monto debe ser un numero entero de centavos', 'INVALID_AMOUNT') }
  if (n <= 0) throw validationError('El monto debe ser positivo en centavos (I-08)', 'INVALID_AMOUNT')
  return n
}

export function validateCurrency(value) {
  try { return assertCurrency(value) }
  catch { throw validationError(`Moneda no soportada: ${value}`, 'UNSUPPORTED_CURRENCY') }
}

export function validateOccurredOn(value) {
  const date = String(value || '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw validationError('La fecha debe tener formato AAAA-MM-DD', 'INVALID_DATE')
  const d = new Date(`${date}T00:00:00-06:00`)
  if (Number.isNaN(d.getTime())) throw validationError('La fecha no es valida', 'INVALID_DATE')
  return date
}

export function validateDescription(value) {
  return String(value || '').trim().slice(0, 200) || ''
}

export function validateNotes(value) {
  return value === undefined ? null : String(value || '').trim().slice(0, 500) || null
}

/** Fecha de negocio `YYYY-MM-DD` en America/Guatemala (I-09). */
function todayBusinessDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' })
}
