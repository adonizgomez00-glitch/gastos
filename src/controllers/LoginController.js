import { api } from '../services/ApiClient.js'
import { renderLogin } from '../views/LoginView.js'
import { renderHome } from '../views/HomeView.js'
import { appConfig } from '../config/app.js'

const FRIENDLY_ERRORS = {
  INVALID_CREDENTIALS: 'Email o contraseña incorrectos.',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
}

/**
 * Controlador de acceso: renderiza la vista y gestiona el formulario.
 * @param {HTMLElement} root elemento raíz
 * @param {{ navigate: (hash: string) => void }} deps dependencias
 */
export function mountLogin(root, { navigate }) {
  root.innerHTML = renderLogin()
  const form = root.querySelector('#login-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const submit = root.querySelector('#login-submit')
    submit.disabled = true
    try {
      const { status, data: payload } = await api.post('api/auth/login', {
        email: String(data.get('email') || ''),
        password: String(data.get('password') || '')
      })
      if (status === 200) {
        navigate(appConfig.routes.home)
        return
      }
      const code = payload && typeof payload.code === 'string' ? payload.code : 'UNKNOWN'
      root.innerHTML = renderLogin({ error: FRIENDLY_ERRORS[code] || 'No se pudo entrar. Probá de nuevo.' })
      mountLogin(root, { navigate })
    } catch {
      root.innerHTML = renderLogin({ error: 'Sin conexión con el servidor.' })
      mountLogin(root, { navigate })
    }
  })
}

/**
 * Controlador de la vista principal mínima.
 * @param {HTMLElement} root elemento raíz
 * @param {{ navigate: (hash: string) => void }} deps dependencias
 */
export async function mountHome(root, { navigate }) {
  const { status, data } = await api.get('api/auth/me')
  if (status !== 200) {
    navigate(appConfig.routes.login)
    return
  }
  root.innerHTML = renderHome(data)
  root.querySelector('#logout').addEventListener('click', async () => {
    await api.post('api/auth/logout')
    navigate(appConfig.routes.login)
  })
}
