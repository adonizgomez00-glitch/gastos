/**
 * Errores tipados de la aplicación.
 * Forma única de respuesta: { error, code, status } (AGENT.md §9.4).
 */
export class AppError extends Error {
  /**
   * @param {string} message mensaje en español, apto para mostrar al usuario
   * @param {object} [options]
   * @param {number} [options.status] código HTTP
   * @param {string} [options.code] código de máquina
   * @param {Error} [options.cause] causa original (no se expone al cliente)
   */
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', cause } = {}) {
    super(message)
    this.name = new.target.name
    this.status = status
    this.code = code
    if (cause) this.cause = cause
    Error.captureStackTrace?.(this, new.target)
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Datos inválidos') {
    super(message, { status: 422, code: 'VALIDATION_ERROR' })
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Sesión requerida') {
    super(message, { status: 401, code: 'UNAUTHENTICATED' })
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Credenciales inválidas') {
    super(message, { status: 401, code: 'INVALID_CREDENTIALS' })
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, { status: 403, code: 'FORBIDDEN' })
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, { status: 404, code: 'NOT_FOUND' })
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicto con el estado actual') {
    super(message, { status: 409, code: 'CONFLICT' })
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Probá más tarde.') {
    super(message, { status: 429, code: 'TOO_MANY_ATTEMPTS' })
  }
}
