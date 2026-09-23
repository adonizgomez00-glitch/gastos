import { randomUUID } from 'node:crypto'
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js'

/** Tipos de categoría permitidos (AGENT.md §6.1). */
export const CATEGORY_KINDS = ['expense', 'income']

/** Profundidad máxima de jerarquía: un solo nivel (SPEC-003 §11). */
export const MAX_DEPTH = 1

/**
 * Servicio de categorías (SPEC-003).
 * Reglas: jerarquía de un nivel, padre del mismo tipo y espacio, UNIQUE
 * (space_id, kind, name) reflejado como 409, y borrado bloqueado si la categoría
 * tiene transacciones (I-05, `CATEGORY_IN_USE`).
 */
export class CategoryService {
  /**
   * @param {object} deps dependencias
   * @param {import('../repositories/CategoryRepository.js').CategoryRepository} deps.categoryRepository
   * @param {import('../repositories/AuditRepository.js').AuditRepository} deps.auditRepository
   */
  constructor({ categoryRepository, auditRepository }) {
    this._categories = categoryRepository
    this._audit = auditRepository
  }

  /**
   * Crea una categoría en el espacio del dueño.
   * @param {{ spaceId: string, userId?: string, name: string, kind: string,
   *           parentId?: string|null, color?: string|null, icon?: string|null }} input datos
   * @returns {object} categoría creada
   * @throws {ValidationError|ConflictError}
   */
  create({ spaceId, userId = null, name, kind, parentId = null, color = null, icon = null }) {
    const cleanName = String(name || '').trim()
    if (!cleanName) throw new ValidationError('El nombre de la categoría es obligatorio')

    const cleanKind = String(kind || '').trim().toLowerCase()
    if (!CATEGORY_KINDS.includes(cleanKind)) {
      throw new ValidationError(`Tipo de categoría inválido: debe ser ${CATEGORY_KINDS.join(' o ')}`)
    }

    const parent = this._resolveParent(spaceId, parentId, cleanKind)

    const duplicate = this._categories.findByName(spaceId, cleanName, cleanKind)
    if (duplicate) {
      throw new ConflictError(`Ya existe la categoría "${cleanName}" de tipo ${cleanKind} en este espacio`)
    }

    const category = this._categories.create({
      id: randomUUID(),
      spaceId,
      name: cleanName,
      kind: cleanKind,
      parentId: parent ? parent.id : null,
      color,
      icon
    })

    this._audit.record({
      entity: 'categories',
      entityId: category.id,
      action: 'create',
      after: category,
      spaceId,
      userId
    })

    return toPublic(category)
  }

  /**
   * Lista categorías del espacio como árbol de un nivel (AC-05).
   * @param {string} spaceId espacio
   * @param {{ kind?: string, includeArchived?: boolean }} [options] filtros
   * @returns {object[]} categorías raíz con `children`
   */
  tree(spaceId, { kind, includeArchived = false } = {}) {
    const all = this._categories.listBySpace(spaceId, { kind, includeArchived })
    const roots = all.filter((category) => !category.parentId)
    return roots.map((root) => ({
      ...toPublic(root),
      children: all.filter((child) => child.parentId === root.id).map(toPublic)
    }))
  }

  /**
   * Obtiene una categoría del espacio (404 si es de otro espacio, I-07).
   * @param {string} spaceId espacio @param {string} id categoría
   * @returns {object} categoría
   * @throws {NotFoundError}
   */
  get(spaceId, id) {
    const category = this._categories.findById(spaceId, id)
    if (!category) throw new NotFoundError('Categoría no encontrada')
    return toPublic(category)
  }

  /**
   * Edita una categoría. Bloquea cambios incoherentes:
   * cambiar `kind` con transacciones asociadas (AC-07) y crear ciclos de jerarquía.
   * @param {{ spaceId: string, userId?: string, id: string, changes: object }} input datos
   * @returns {object} categoría actualizada
   * @throws {NotFoundError|ValidationError|ConflictError}
   */
  update({ spaceId, userId = null, id, changes }) {
    const current = this._categories.findById(spaceId, id)
    if (!current) throw new NotFoundError('Categoría no encontrada')

    const patch = {}
    if (changes.name !== undefined) {
      const cleanName = String(changes.name).trim()
      if (!cleanName) throw new ValidationError('El nombre de la categoría es obligatorio')
      patch.name = cleanName
    }
    if (changes.color !== undefined) patch.color = changes.color
    if (changes.icon !== undefined) patch.icon = changes.icon

    const targetKind = changes.kind !== undefined
      ? String(changes.kind).trim().toLowerCase()
      : current.kind
    if (!CATEGORY_KINDS.includes(targetKind)) {
      throw new ValidationError(`Tipo de categoría inválido: debe ser ${CATEGORY_KINDS.join(' o ')}`)
    }
    if (targetKind !== current.kind) {
      // AC-07: no se cambia el tipo si ya hay transacciones (evita incoherencia histórica).
      if (this._categories.countTransactions(spaceId, id) > 0) {
        throw new ConflictError('No se puede cambiar el tipo de una categoría con transacciones')
      }
      if (this._categories.countChildren(spaceId, id) > 0) {
        throw new ConflictError('No se puede cambiar el tipo de una categoría que tiene subcategorías')
      }
      patch.kind = targetKind
    }

    if (changes.parentId !== undefined) {
      const parent = this._resolveParent(spaceId, changes.parentId, targetKind)
      if (parent && parent.id === id) {
        throw new ValidationError('Una categoría no puede ser su propio padre')
      }
      if (parent && parent.parentId) {
        throw new ValidationError('La jerarquía admite un solo nivel (la categoría padre debe ser raíz)')
      }
      if (parent && this._categories.countChildren(spaceId, id) > 0) {
        throw new ConflictError('No se puede anidar una categoría que ya tiene subcategorías')
      }
      patch.parentId = parent ? parent.id : null
    }

    if (patch.name || patch.kind) {
      const duplicate = this._categories.findByName(
        spaceId,
        patch.name || current.name,
        patch.kind || current.kind
      )
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('Ya existe una categoría con ese nombre y tipo en este espacio')
      }
    }

    const updated = this._categories.update(spaceId, id, patch)
    this._audit.record({
      entity: 'categories',
      entityId: id,
      action: 'update',
      before: current,
      after: updated,
      spaceId,
      userId
    })
    return toPublic(updated)
  }

  /**
   * Archiva una categoría (I-05). Se prefiere sobre el borrado físico.
   * @param {{ spaceId: string, userId?: string, id: string }} input datos
   * @returns {object} categoría archivada
   * @throws {NotFoundError}
   */
  archive({ spaceId, userId = null, id }) {
    const current = this._categories.findById(spaceId, id)
    if (!current) throw new NotFoundError('Categoría no encontrada')
    const updated = this._categories.setArchived(spaceId, id, true)
    this._audit.record({
      entity: 'categories',
      entityId: id,
      action: 'archive',
      before: current,
      after: updated,
      spaceId,
      userId
    })
    return toPublic(updated)
  }


  /**
   * Elimina físicamente una categoría sin dependencias (AC-08/AC-09/AC-10).
   * Bloquea el borrado si tiene transacciones (`CATEGORY_IN_USE`) o presupuestos.
   * @param {{ spaceId: string, userId?: string, id: string }} input datos
   * @returns {{ deleted: true, id: string }} confirmación
   * @throws {NotFoundError|ConflictError}
   */
  remove({ spaceId, userId = null, id }) {
    const current = this._categories.findById(spaceId, id)
    if (!current) throw new NotFoundError('Categoría no encontrada')

    if (this._categories.countTransactions(spaceId, id) > 0) {
      throw new ConflictError('La categoría tiene transacciones asociadas y no se puede eliminar')
    }
    if (this._categories.countBudgets(spaceId, id) > 0) {
      throw new ConflictError('La categoría tiene presupuestos asociados y no se puede eliminar')
    }
    if (this._categories.countChildren(spaceId, id) > 0) {
      throw new ConflictError('La categoría tiene subcategorías y no se puede eliminar')
    }

    this._categories.delete(spaceId, id)
    this._audit.record({
      entity: 'categories',
      entityId: id,
      action: 'delete',
      before: current,
      after: null,
      spaceId,
      userId
    })
    return { deleted: true, id }
  }

  /**
   * Resuelve y valida la categoría padre (AC-03).
   * Reglas: debe existir en el espacio, ser raíz y del mismo tipo.
   * @param {string} spaceId espacio @param {string|null} parentId padre @param {string} kind tipo
   * @returns {object|null} padre resuelto o null
   * @throws {ValidationError}
   */
  _resolveParent(spaceId, parentId, kind) {
    if (parentId === null || parentId === undefined || parentId === '') return null
    const parent = this._categories.findById(spaceId, String(parentId))
    if (!parent) throw new ValidationError('La categoría padre no existe en este espacio')
    if (parent.archived) throw new ValidationError('La categoría padre está archivada')
    if (parent.parentId) {
      throw new ValidationError('La jerarquía admite un solo nivel (la categoría padre debe ser raíz)')
    }
    if (parent.kind !== kind) {
      throw new ValidationError('La categoría padre debe ser del mismo tipo (gasto o ingreso)')
    }
    return parent
  }
}

/**
 * Proyecta una categoría para el cliente.
 * @param {object} category categoría
 * @returns {object} representación pública
 */
export function toPublic(category) {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    parentId: category.parentId,
    color: category.color,
    icon: category.icon,
    archived: category.archived,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt
  }
}
