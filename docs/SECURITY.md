# SECURITY.md — Gastos

**Modelo de amenazas resumido:** `ARCHITECTURE.md` §8 · **Reglas obligatorias:** `AGENT.md` §9

---

## 1. Punto de partida (no negociable)

La aplicación se publica por **Tailscale Funnel**: `https://thinkpad.tail60dd6a.ts.net/gastos/`
es una URL de **internet público**, no un recurso privado de la tailnet. Consecuencias:

1. La autenticación es **obligatoria** en toda ruta de negocio.
2. La cookie de sesión viaja **solo** con `Secure` (HTTPS de punta a punta vía Funnel).
3. Cualquier endpoint nuevo se asume **hostil** y valida su entrada.

## 2. Identidad y sesión

| Control | Implementación |
|---|---|
| Hash de contraseña | PBKDF2-SHA512, 100.000 iteraciones, salt de 32 bytes, clave de 64 bytes (WebCrypto) |
| Comparación | en **tiempo constante** |
| Token de sesión | `randomBytes(32).toString('hex')` (256 bits) |
| Cookie | `gastos_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/gastos` |
| TTL | 12 h por defecto; rotación de token en cada login |
| Logout | invalida el token en la BD (no alcanza con borrar la cookie) |
| Fuerza bruta | 5 intentos / 15 min por IP+email, respuesta genérica |

**Alta de usuario:** solo por CLI (`npm run user:create`). No hay registro público ni recuperación
por email en el MVP: si se pierde la contraseña, se restablece desde la máquina con el CLI.

## 3. Autorización y aislamiento

- Toda ruta resuelve el `space_id` **desde la sesión**; jamás se acepta del cliente.
- Recurso de otro espacio → **404** (no 403): no se filtra la existencia.
- Test obligatorio: el espacio A no puede leer ni modificar datos del espacio B (I-07).

## 4. Entradas, inyección y XSS

| Riesgo | Control |
|---|---|
| Inyección SQL | `prepare()` con parámetros, siempre; **prohibida** la concatenación de SQL |
| XSS reflejado/almacenado | escape de todo dato del usuario; prohibido `innerHTML` con datos |
| CSRF | `SameSite=Lax` + verificación de `Origin` en mutaciones |
| Body excesivo | límite de tamaño de cuerpo (`GASTOS_BODY_LIMIT`, 1 MB por defecto) |
| JSON malformado | error `422` controlado, nunca stack trace al cliente |

## 5. Cabeceras de respuesta

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'
```

## 6. Datos sensibles

- **Logs:** prohibido registrar montos, descripciones, emails o tokens (I-12).
Se registra método, ruta, estado, duración y un identificador de correlación.
- **Respuestas:** nunca se devuelve `password_hash`, `password_salt` ni tokens de otros usuarios (I-10).
- **Backups:** `backups/` fuera de git; en producción con permisos del usuario `gastos`.
- **Configuración:** `.env` fuera de git y `chmod 600` en producción.

## 7. Superficie de despliegue

| Control | Detalle |
|---|---|
| Proceso | usuario de sistema `gastos`, sin shell, `NoNewPrivileges=true` |
| Escucha | `127.0.0.1:8100` (nunca `0.0.0.0`) |
| Exposición | solo a través de nginx (`:8000`) y Funnel |
| Permisos | `chown -R gastos:gastos /opt/gastos`; `.env` en 600 |
| nginx | edición **aditiva** del vhost con backup previo (ADR-005) |

## 8. Verificación de seguridad por iteración

```bash
# 1. Ninguna ruta de negocio responde sin sesión (esperado: 401)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/api/transactions

# 2. La cookie de sesión es HttpOnly y Secure
curl -sI -X POST http://127.0.0.1:8100/api/auth/login | grep -i 'set-cookie'

# 3. Sin datos sensibles en los logs
! grep -E 'amount|description|password|email' /opt/gastos/*.log

# 4. Aislamiento entre espacios (test automatizado, I-07)
npm test -- --grep aislamiento
```

## 9. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación: identidad, sesión, autorización, entradas, cabeceras, datos sensibles y verificación. |
