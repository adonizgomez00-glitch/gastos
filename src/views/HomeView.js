import { escapeHtml } from './html.js'

/**
 * Vista principal mínima (ITER-001): saludo y salida.
 * Los módulos de negocio llegan con las siguientes specs.
 * @param {{ name?: string, email?: string }} user usuario público
 * @returns {string} HTML
 */
export function renderHome(user = {}) {
  const name = escapeHtml(user.name || 'Dueño')
  return `
  <main class="card" aria-labelledby="titulo">
    <h1 id="titulo">Hola, ${name}</h1>
    <p class="muted">Sesión iniciada correctamente. Los módulos de gastos llegan en las próximas iteraciones.</p>
    <button type="button" id="logout">Cerrar sesión</button>
  </main>`
}
