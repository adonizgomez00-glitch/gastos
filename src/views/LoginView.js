import { escapeHtml } from './html.js'

/**
 * Vista de acceso. Todo dato mostrado se escapa (regla §9.7).
 * @param {object} [state] `{ error?: string }`
 * @returns {string} HTML
 */
export function renderLogin(state = {}) {
  return `
  <main class="card" aria-labelledby="titulo">
    <h1 id="titulo">Gastos</h1>
    <p class="muted">Administrador personal de gastos</p>
    ${state.error ? `<p class="error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    <form id="login-form" method="post" action="#/login">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Contraseña</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit" id="login-submit">Entrar</button>
    </form>
  </main>`
}
