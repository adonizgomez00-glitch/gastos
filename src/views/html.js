const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/**
 * Escapa texto del usuario antes de insertarlo en el DOM (§9.7).
 * @param {unknown} value valor a escapar
 * @returns {string} texto seguro
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}
