/**
 * Limitador de intentos en memoria (ventana deslizante por clave).
 * Se usa para el login: max intentos por ventana y por IP+email.
 */
export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.windowMs tamaño de la ventana en milisegundos
   * @param {number} options.max intentos permitidos por ventana
   * @param {() => number} [options.now] reloj inyectable (pruebas)
   */
  constructor({ windowMs, max, now = () => Date.now() }) {
    this._windowMs = windowMs
    this._max = max
    this._now = now
    this._hits = new Map()
  }

  /**
   * Registra un intento y devuelve el estado de la clave.
   * @param {string} key identificador (por ejemplo `${ip}|${email}`)
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  hit(key) {
    const now = this._now()
    const history = (this._hits.get(key) || []).filter((t) => now - t < this._windowMs)
    if (history.length >= this._max) {
      const retryAfterMs = this._windowMs - (now - history[0])
      this._hits.set(key, history)
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) }
    }
    history.push(now)
    this._hits.set(key, history)
    return { allowed: true, remaining: this._max - history.length, retryAfterMs: 0 }
  }

  /**
   * Consulta si la clave está bloqueada, sin registrar un intento.
   * @param {string} key identificador
   * @returns {boolean} true si ya superó el máximo
   */
  isBlocked(key) {
    const now = this._now()
    const history = (this._hits.get(key) || []).filter((t) => now - t < this._windowMs)
    return history.length >= this._max
  }

  /** Limpia el historial de una clave (por ejemplo, tras un login exitoso). */
  reset(key) {
    this._hits.delete(key)
  }
}
