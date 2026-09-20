import { webcrypto as nodeCrypto } from 'node:crypto'

const KEY_LENGTH_BYTES = 64
const SALT_BYTES = 32
const ALGORITHM = 'SHA-512'

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  return bytes
}

/** Comparación en tiempo constante (evita filtrar información por tiempos). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Servicio de contraseñas con PBKDF2-SHA512 (WebCrypto, sin dependencias).
 * Parámetros: salt de 32 bytes, clave de 64 bytes, iteraciones configurables.
 */
export class PasswordService {
  /** @param {object} [options] @param {number} [options.iterations] iteraciones PBKDF2 */
  constructor({ iterations = 100000 } = {}) {
    this._iterations = iterations
    this._crypto = globalThis.crypto?.subtle ? globalThis.crypto : nodeCrypto
  }

  /** @returns {number} iteraciones configuradas */
  get iterations() {
    return this._iterations
  }

  /**
   * Deriva el hash de una contraseña.
   * @param {string} password contraseña en claro (nunca se registra)
   * @param {string} saltHex salt en hexadecimal
   * @param {number} [iterations] iteraciones a usar
   * @returns {Promise<string>} hash en hexadecimal
   */
  async derive(password, saltHex, iterations = this._iterations) {
    const keyMaterial = await this._crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const bits = await this._crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: ALGORITHM },
      keyMaterial,
      KEY_LENGTH_BYTES * 8
    )
    return toHex(new Uint8Array(bits))
  }

  /**
   * Genera hash y salt para una contraseña nueva.
   * @param {string} password contraseña en claro
   * @returns {Promise<{ hash: string, salt: string, iterations: number }>}
   */
  async hash(password) {
    const saltBytes = new Uint8Array(SALT_BYTES)
    this._crypto.getRandomValues(saltBytes)
    const salt = toHex(saltBytes)
    const hash = await this.derive(password, salt)
    return { hash, salt, iterations: this._iterations }
  }

  /**
   * Verifica una contraseña contra un hash almacenado.
   * @param {string} password contraseña en claro
   * @param {{ hash: string, salt: string, iterations: number }} stored datos guardados
   * @returns {Promise<boolean>} true si coincide
   */
  async verify(password, { hash, salt, iterations }) {
    const candidate = await this.derive(password, salt, iterations)
    return timingSafeEqual(fromHex(candidate), fromHex(hash))
  }
}
