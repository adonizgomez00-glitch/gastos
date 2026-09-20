import { mountHome, mountLogin } from './controllers/LoginController.js'
import { appConfig } from './config/app.js'

/**
 * Bootstrap de la SPA. Router por HASH (AGENT.md §10.3): la profundidad de la URL
 * nunca cambia, así la app funciona igual detrás del prefijo /gastos/.
 */
export function start(root) {
  const navigate = (hash) => { window.location.hash = hash }

  async function render() {
    const route = window.location.hash || appConfig.routes.home
    if (route.startsWith('#/login')) {
      mountLogin(root, { navigate })
      return
    }
    await mountHome(root, { navigate })
  }

  window.addEventListener('hashchange', render)
  render()
}

if (typeof document !== 'undefined') {
  start(document.getElementById('app'))
}
