---
spec_id: SPEC-001
titulo: Autenticacion y sesion del dueno
version: 1.0.0
estado: aprobada
fecha: 2026-09-20
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-010]
adrs: [ADR-001, ADR-005, ADR-006]
---

# SPEC-001 — Autenticación y sesión del dueño

> **Estado: ✅ aprobada** (2026-09-20) · Iteración de implementación: **ITER-001**

## 1. Problema

La aplicación se publica en **internet público** a través de Tailscale Funnel, y en ella están
registrados **los movimientos de dinero de una persona**. Sin autenticación, cualquiera que
conozca la URL puede leer y modificar esos datos. Hoy no existe ningún mecanismo de sesión:
el código de la aplicación todavía no está escrito.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | Una persona (el dueño), en Guatemala, dueña de una máquina con Node 22 y Tailscale |
| Escenario | Abre la app desde el navegador del móvil, preferentemente una vez al día; rara vez desde el escritorio |
| Limitaciones | Escribir contraseñas largas en el móvil es incómodo → la sesión debe durar (no re-login cada vez) |
| Riesgo principal | La URL es pública; el intento de fuerza bruta es cuestión de tiempo, no de probabilidad |

## 3. Objetivo (falsable)

> **Con la aplicación desplegada, toda ruta de negocio responde `401` sin una sesión válida, y el
dueño puede iniciar sesión con su email y contraseña obteniendo una cookie que le permite operar
sin volver a autenticarse durante al menos 12 horas.**

**No se cumple si:** alguna ruta de negocio responde `200` sin sesión, si la contraseña se
almacena o se registra en claro, o si la cookie de sesión no es `HttpOnly` y `Secure`.

## 4. Alcance

### 4.1 Incluye

- Alta del usuario dueño por **CLI** (`npm run user:create`) con validación de contraseña.
- `POST /api/auth/login` con email + contraseña.
- Sesión persistida en la tabla `sessions` con vencimiento.
- Cookie `gastos_session` con `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/gastos`.
- `POST /api/auth/logout` que **invalida el token en la base de datos**.
- `GET /api/auth/me` con los datos básicos del dueño.
- Middleware `requireAuth` para todas las rutas de negocio.
- Límite de intentos de login y limpieza de sesiones vencidas.

### 4.2 No incluye

- **Registro público** y autoalta: contradice el modelo de un solo dueño (ADR-006).
- Recuperación de contraseña por email: no hay servidor de correo en el MVP; se resetea por CLI.
- Segundo factor (TOTP/SMS), passkeys, login social: agregan dependencias y complejidad sin uso real hoy.
- Sesiones "recordarme" de duración configurable por el usuario o sesiones múltiples visibles con
  gestión desde la UI: se implementan un TTL fijo y una limpieza automática.
- Roles y permisos: hay un solo rol efectivo (`owner`); el RBAC llega con el multiusuario (fase 2).
- Cierre de sesión global en todos los dispositivos desde la interfaz.

## 5. Comportamiento

### 5.1 Flujo principal — iniciar sesión

1. La persona abre `/gastos/`. Sin sesión válida, la app muestra el formulario de acceso.
2. Envía email y contraseña a `POST /api/auth/login`.
3. El servicio busca el usuario por email (sin distinguir mayúsculas).
4. Deriva la clave con PBKDF2-SHA512 (100.000 iteraciones, salt de 32 bytes) y **compara en tiempo constante**.
5. Si coincide: crea un token de 256 bits, lo guarda en `sessions` con `expires_at = ahora + 12 h`,
   responde `200` y setea la cookie.
6. Las peticiones siguientes se autentican con la cookie; `requireAuth` valida token, vigencia y usuario activo.

### 5.2 Flujos alternativos

- **Credenciales incorrectas** → `401` con el **mismo** mensaje y el mismo tiempo de respuesta que un email inexistente.
- **Email inexistente** → idéntico `401` genérico (no se revela la existencia del usuario).
- **Demasiados intentos** (6.º en 15 min por IP+email) → `429` sin evaluar credenciales.
- **Sin cookie o vencida** → `401` en cualquier ruta de negocio; el cliente vuelve al formulario.
- **Token inexistente o manipulado** → `401` y la cookie se borra en la respuesta.
- **Logout** → elimina la fila de `sessions` y borra la cookie; reusar el token viejo da `401`.

### 5.3 Casos límite

- Usuario existente pero `active = 0` → `401` (cuenta deshabilitada, mismo mensaje genérico).
- Reloj del servidor hacia atrás: `expires_at` se compara con la hora del servidor en cada petición.
- Sesiones vencidas acumuladas: se purgan al iniciar el servidor y en cada login exitoso.
- Email con mayúsculas o espacios (`  Foo@Bar.GT `) → se normaliza a minúsculas y sin espacios.
- Contraseña de menos de 12 caracteres al crear el usuario por CLI → rechazo con mensaje claro.
- Cookie presente pero correspondiente a un usuario borrado o desactivado → `401` y purga de la sesión.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| **AC-01** | Login correcto | un usuario activo con email y contraseña válidos | envía `POST /api/auth/login` con las credenciales correctas | responde `200`, setea la cookie `gastos_session` con `HttpOnly`, `Secure`, `SameSite=Lax` y crea una fila en `sessions` |
| **AC-02** | Contraseña incorrecta | el mismo usuario | envía la contraseña equivocada | responde `401` con el código `INVALID_CREDENTIALS` y **sin** cookie |
| **AC-03** | Email inexistente | ningún usuario con ese email | envía credenciales | responde `401` con el **mismo** cuerpo y código que AC-02 |
| **AC-04** | Fuerza bruta | 5 intentos fallidos desde la misma IP en 15 min | envía el 6.º intento, incluso con la contraseña correcta | responde `429` con código `TOO_MANY_ATTEMPTS` y no crea sesión |
| **AC-05** | Ruta protegida sin sesión | no hay cookie | pide `GET /api/transactions` | responde `401` con código `UNAUTHENTICATED` |
| **AC-06** | Token manipulado | una cookie con un token que no existe en la BD | pide cualquier ruta de negocio | responde `401` y la respuesta incluye el borrado de la cookie |
| **AC-07** | Sesión vencida | una sesión con `expires_at` en el pasado | pide cualquier ruta de negocio | responde `401` y la fila de sesión se elimina |
| **AC-08** | Logout | una sesión válida | envía `POST /api/auth/logout` y luego reutiliza el mismo token | el logout responde `200`, y el token reutilizado obtiene `401` |
| **AC-09** | Contraseña nunca en claro | un usuario creado por CLI | se inspeccionan la tabla `users` y los logs del servidor | `password_hash` es un hash PBKDF2 (no la contraseña), existe `password_salt` distinto, y **ni la contraseña ni el hash aparecen en los logs** |
| **AC-10** | Rotación de token | dos inicios de sesión consecutivos del mismo usuario | se comparan los tokens emitidos | son distintos entre sí |
| **AC-11** | Datos del usuario | una sesión válida | pide `GET /api/auth/me` | responde `200` con `id`, `email`, `name`, `baseCurrency` y `timezone`, y **sin** `password_hash` ni `password_salt` |
| **AC-12** | Purga de sesiones | 3 sesiones vencidas en la tabla | arranca el servidor o se produce un login exitoso | las sesiones vencidas ya no existen en la tabla |
| **AC-13** | Contraseña débil en el alta | se ejecuta `npm run user:create` | se ingresa una contraseña de 8 caracteres | el script rechaza el alta con un mensaje claro y no crea ni un usuario ni una sesión |
| **AC-14** | Normalización de email | el usuario existe como `dueno@example.com` | se intenta login con `  DUENO@Example.COM ` | el login funciona igual que AC-01 |
| **AC-15** | Usuario desactivado | un usuario con `active = 0` y contraseña correcta | intenta iniciar sesión | responde `401` con el mismo mensaje genérico que AC-02 |

## 7. Ejemplos ejecutables

```bash
# 1. Alta del dueño (una sola vez)
npm run user:create            # pide email, nombre y contraseña (mínimo 12 caracteres)

# 2. Ruta de negocio sin sesión -> 401
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/api/transactions

# 3. Login correcto -> 200 + cookie
curl -s -c /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"email":"dueno@example.com","password":"<contraseña>"}' \
  http://127.0.0.1:8100/api/auth/login

# 4. La cookie es HttpOnly y Secure (AC-01)
grep -E 'gastos_session' /tmp/gastos.cookies

# 5. Con la cookie, la ruta responde 200
curl -s -b /tmp/gastos.cookies http://127.0.0.1:8100/api/auth/me

# 6. Logout y reutilización del token -> 401 (AC-08)
curl -s -b /tmp/gastos.cookies -X POST http://127.0.0.1:8100/api/auth/logout
curl -s -o /dev/null -w '%{http_code}\n' -H 'Cookie: gastos_session=<token viejo>' \
  http://127.0.0.1:8100/api/transactions
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Node 22 + `node:sqlite` + `node:http`; sin dependencias externas; `PasswordService` con WebCrypto |
| Técnica | El token es opaco (256 bits aleatorios), no JWT: la validación es una consulta a `sessions` |
| De negocio | Un solo dueño; no hay registro público; la contraseña se restablece por CLI |
| De negocio | TTL de sesión fijo de 12 h (configurable por variable de entorno, no por el usuario en la UI) |
| De seguridad | PBKDF2-SHA512, 100.000 iteraciones, salt de 32 bytes, 64 bytes de clave, comparación en tiempo constante |
| De seguridad | Cookie `HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/gastos`; verificación de `Origin` en mutaciones |
| De seguridad | Mensaje único de error; prohibido loggear credenciales, montos o emails (I-12) |
| De seguridad | Máximo 5 intentos fallidos por 15 minutos por IP + email |

## 9. Contratos

```
POST /api/auth/login    { email, password }        -> 200 { id, email, name } + Set-Cookie
                                                      401 { error, code: 'INVALID_CREDENTIALS', status }
                                                      429 { error, code: 'TOO_MANY_ATTEMPTS', status }
POST /api/auth/logout   (cookie)                   -> 200 { ok: true } + cookie borrada
GET  /api/auth/me       (cookie)                   -> 200 { id, email, name, baseCurrency, timezone }
                                                      401 { error, code: 'UNAUTHENTICATED', status }
```

## 10. Trazabilidad

| AC | Test previsto | Archivo de código previsto |
|----|---------------|----------------------------|
| AC-01, AC-10, AC-12 | `tests/integration/auth.login.test.js` | `server/services/AuthService.js`, `server/routes/auth.js` |
| AC-02, AC-03, AC-14, AC-15 | `tests/integration/auth.invalid.test.js` | idem |
| AC-04 | `tests/integration/auth.ratelimit.test.js` | `server/utils/rateLimiter.js` |
| AC-05, AC-06, AC-07, AC-08 | `tests/integration/auth.session.test.js` | `server/middleware/auth.js` |

> **Precisión (2026-09-20):** los ejemplos usan `GET /api/transactions` como ruta protegida, pero esa ruta
> llega con SPEC-004. En ITER-001 la ruta protegida de prueba es **`GET /api/auth/me`**; el criterio
> (401 sin sesión válida) no cambia.
| AC-09 | `tests/integration/auth.password.test.js` | `src/services/PasswordService.js` |
| AC-11 | `tests/integration/auth.me.test.js` | `server/routes/auth.js` |
| AC-13 | `tests/unit/create-user.test.js` | `scripts/create-user.js` |

## 11. Notas y decisiones abiertas

- ✅ Decidido: **sin registro público**; el dueño se crea por CLI (2026-09-20).
- ✅ Decidido: token **opaco** en tabla `sessions`, no JWT (revocable de inmediato).
- ✅ Decidido: la contraseña se restablece por CLI; no hay recuperación por email en el MVP.
- ✅ Decidido: TTL de **12 h** (suficiente para el uso diario desde el móvil, acotado ante robo).
- ❓ Abierto: si tras el primer uso resulta incómodo re-autenticarse, evaluar "recordarme" de 30 días
  con token separado (fase 2). Decide: el dueño del producto.
- ❓ Abierto: si se agregan varios dispositivos habituales, evaluar listado de sesiones activas (fase 2).

## 12. Checklist antes de aprobar

```
[x] Problema entendido sin contexto adicional
[x] Objetivo binario falsable
[x] Contexto acotado (usuario real + escenario + límites)
[x] "Incluye" y "No incluye" no vacíos
[x] Comportamiento: principal + alternativos + casos límite
[x] AC en Given/When/Then (15 criterios)
[x] Ejemplos ejecutables (login, cookie, logout, 401)
[x] Restricciones técnicas, de negocio y de seguridad
[x] Trazabilidad AC -> test -> código
[x] Aprobación explícita del dueño (2026-09-20)
```
