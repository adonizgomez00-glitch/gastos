# AGENT.md — Contrato operativo del proyecto **Gastos**

> **Documento canónico.** Toda persona o agente que trabaje en este repositorio lo lee **primero**.
> Última revisión: 2026-09-20 · Fase 0 (decisiones cerradas, **sin código**)
> Estado del proyecto: [`CHECKPOINT.md`](./CHECKPOINT.md) · Arquitectura: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 1. Propósito y regla de oro

`Gastos` es una **aplicación web en línea para administrar gastos personales** en quetzales
(GTQ) y dólares (USD), con conversión automática, presupuestos mensuales, recurrentes,
múltiples cuentas y transferencias. Es de **uso personal, un solo dueño**, pero su modelo de
datos está preparado desde el día 1 para varias personas (`space_id`).

### 1.1 Regla de oro (no negociable)

**No se escribe código, no se crea ningún archivo de implementación y no se instala ninguna
dependencia hasta que el usuario diga explícitamente "implementar"** (o un equivalente
inequívoco). Mientras no lo diga, el trabajo es **descubrir, proponer, especificar y documentar**.

### 1.2 Protocolo de interacción

| ID | Regla |
|----|-------|
| **P-01** | **Una pregunta a la vez** y esperar la respuesta antes de continuar. |
| **P-02** | Ante una decisión abierta, ofrecer **hasta 3 opciones**, **recomendar una** y explicar **beneficio y coste** de cada una. |
| **P-03** | **Prohibido inventar requisitos.** Si falta información, se pregunta; nunca se asume en silencio. |
| **P-04** | Al cerrar un bloque de decisiones, **resumir la especificación** y **pedir aprobación explícita**. |
| **P-05** | Si el usuario cambia una decisión, **actualizar los documentos vivos en el mismo turno**. |
| **P-06** | Toda afirmación sobre el estado del sistema (puerto, servicio, tasa, disco, tests) **se mide**, no se recuerda. |
| **P-07** | Idioma de trabajo: **español** en código, UI, documentos y commits. |
| **P-08** | Si una afirmación del usuario choca con la evidencia, **verificar antes de aceptarla o rechazarla** y mostrar la evidencia. |

### 1.3 Orden de lectura obligatorio

1. `AGENT.md` (este archivo) · 2. `ARCHITECTURE.md` · 3. `CHECKPOINT.md` ·
4. `docs/CONTEXT.md` · 5. la spec activa `docs/specs/SPEC-XXX.md`.

Estado de infraestructura (servicio, puerto, nginx, Funnel, disco): `docs/Context_live.md`
(**local, fuera de git**; puede no existir todavía).

---

## 2. Visión y dominio

### 2.1 Problema

El dinero se va sin registro y sin visibilidad: al final del mes no se sabe cuánto se gastó en
qué, ni cuánto del gasto está en dólares con cotización distinta. Sin registro en el momento,
la información se pierde; sin conversión, los totales mezclan monedas.

### 2.2 Usuario y contexto (acotado, no "usuario general")

- **Usuario real:** una sola persona (el dueño), en **Guatemala**.
- **Monedas:** ingresos y gastos en **GTQ** y **USD** (compras en línea, suscripciones, remesas).
- **Dispositivo principal:** el **navegador del móvil**, de pie, en la caja, con prisa; el
escritorio es secundario.
- **Limitación real:** registrar debe ser rapidísimo, o no se usa.
- **Antecedente:** el control actual es manual (hojas de cálculo); la app lo reemplaza.

### 2.3 Objetivo falsable

> **Registrar un gasto desde el móvil en ≤ 20 segundos y consultar el total del mes por
> categoría exacto al centavo, con las transferencias excluidas.**

Se cumple o no se cumple; no hay interpretación. Si registrar tarda más, o un total difiere
en un centavo, el objetivo **no** se cumple.

### 2.4 Métricas de éxito

| Métrica | Objetivo |
|---|---|
| Tiempo de registro de un gasto (móvil) | ≤ 20 s |
| Exactitud de totales | 0 diferencias de centavos en las pruebas financieras |
| Frescura de la cotización | ≤ 24 h, con `rate_source` registrado en cada transacción |
| Cobertura de criterios de aceptación | 100 % de los AC con test 1:1 |

---

## 3. Alcance

### 3.1 Incluye (MVP)

| # | Capacidad | Detalle |
|---|---|---|
| **A1** | Autenticación | dueño único: email + contraseña, sesión en cookie |
| **A2** | Cuentas | efectivo, débito, crédito; saldo inicial; archivar |
| **A3** | Categorías | gasto/ingreso, jerárquicas (1 nivel), color e ícono; archivar |
| **A4** | Transacciones | gasto/ingreso con monto, moneda, cuenta, categoría, fecha y descripción |
| **A5** | Transferencias | entre cuentas, dos patas enlazadas; **no** cuentan como gasto ni ingreso |
| **A6** | Presupuestos | mensual por categoría, en moneda base, con alerta de exceso |
| **A7** | Recurrentes | mensual / semanal / quincenal / anual, con generación **idempotente** |
| **A8** | Multimoneda | GTQ base + USD; cotización **congelada** al registrar; override manual |
| **A9** | Reportes | total del mes, por categoría y por cuenta, comparado con el mes anterior |
| **A10** | Administración | alta del usuario por CLI, backup de la BD, refresco de cotizaciones |

### 3.2 No incluye (exclusiones explícitas)

- **PWA, service worker, modo sin conexión y sincronización offline.**
- **Importación de extractos** bancarios (CSV/OFX/Excel) y cualquier scraping bancario.
- Adjuntar fotos o PDFs de recibos.
- **UI** de gastos compartidos entre personas (el modelo queda preparado con `space_id`).
- Notificaciones push/email, recordatorios, gamificación, metas de ahorro, inversiones, cripto.
- App nativa (Android/iOS), escritorio, exportación a PDF.
- Multiusuario con roles y permisos (el modelo queda preparado con `space_members`).
- Bloqueo/inmutabilidad de meses cerrados → **fase 2**.

> Regla A-SDD-004: esta sección **no puede quedar vacía**. Si algo entra al alcance, se mueve a
> §3.1 con su spec; si algo sale, se documenta acá el motivo.

---

## 4. Stack y comandos

### 4.1 Stack decidido

| Capa | Tecnología | Motivo |
|---|---|---|
| Runtime | **Node.js 22** (v22.23.1 en la máquina de despliegue) | `node:sqlite` nativo, sin dependencias externas |
| Base de datos | **SQLite** vía `node:sqlite` (`DatabaseSync`) | un archivo, backup trivial, WAL |
| Servidor HTTP | `node:http` + router propio (`server/router.js`) | sin Express ni Fastify |
| Arquitectura | **MVC estricto**: `View → Controller → Service → Repository → DB` | testabilidad y separación |
| Cliente | HTML + CSS + **JS ES Modules vanilla**, router por **hash** | sin build, sin bundler |
| Estilos | CSS con custom properties, **mobile-first** | sin Tailwind ni Bootstrap |
| Cotizaciones | `open.er-api.com` (primaria) · Banguat SOAP (secundaria) · override manual | ver §8 |
| Tests | runner propio sin dependencias + Playwright para E2E | mismo patrón que los proyectos previos |

**Verificado en la máquina** (no asumido): `node:sqlite` está disponible **sin flag** en Node
v22.23.1 y solo emite `ExperimentalWarning`; por eso el arranque usa
`--disable-warning=ExperimentalWarning`.

### 4.2 Dependencias prohibidas

Nada de: Express, Fastify, Koa, Prisma, Sequelize, Drizzle, React, Vue, Svelte, jQuery,
Tailwind, Bootstrap, webpack, Vite, TypeScript, bcrypt (se usa el `PasswordService` con
WebCrypto), axios (se usa `fetch`), dotenv (los defaults viven en `server/config`).

Justificación: cero superficie de dependencias, cero build y arranque en segundos.

### 4.3 Comandos

| Comando | Efecto |
|---|---|
| `npm start` | `node --disable-warning=ExperimentalWarning server/index.js` |
| `npm run dev` | igual, con `--watch` |
| `npm run migrate` | aplica migraciones pendientes (idempotente) |
| `npm run user:create` | crea/actualiza el usuario dueño (CLI; **no hay registro público**) |
| `npm run rates:refresh` | actualiza cotizaciones USD→GTQ (primaria → secundaria → carry-forward) |
| `npm run backup:db` | backup consistente con `sqlite3 .backup` |
| `npm run context:live` | regenera `docs/Context_live.md` (local, fuera de git) |
| `npm test` | tests unitarios + integración (`tests/run-all.js`, sin dependencias) |
| `npm run test:e2e` | Playwright contra el servidor local (requiere `npm install`) |
| `npm run check:docs` | verifica consistencia `CHECKPOINT.md` ↔ `docs/Context_live.md` (§13.5) |

### 4.4 Reglas de stack

- **Todo** acceso a SQLite pasa por `server/database/sqlite.js` (`openDatabase`). Prohibido instanciar `DatabaseSync` en otro archivo.
- PRAGMA obligatorios al abrir: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- El cliente **no** conoce SQL ni la BD: solo `fetch` a la API.
- **Sin step de build**: los archivos escritos son los que se sirven.
- Toda ruta de API empieza con `/api/` y responde JSON (`application/json; charset=utf-8`).
- Forma única de error: `{ error, code, status }` (§9.4).

---

## 5. Arquitectura MVC estricta

### 5.1 Capas y regla de dependencia

```
View  →  Controller  →  Service  →  Repository  →  DB
```

| Capa | Responsabilidad | Prohibiciones |
|---|---|---|
| **View** (cliente) | renderizar y capturar eventos del usuario | NUNCA llama a Repository, a Service del servidor ni a la BD; solo a la API |
| **Controller** (handler de ruta) | validar forma de la petición, exigir sesión, llamar al Service, armar la respuesta | NUNCA contiene reglas de negocio ni SQL |
| **Service** | lógica de negocio, validaciones, transacciones, orquestación de repositorios | NUNCA conoce `req`/`res` |
| **Repository** | **único** lugar con SQL | NUNCA aplica reglas de negocio |

Nadie salta capas "por rapidez". Un `Service` puede usar varios `Repository`; un `Repository`
no usa otro `Repository` (si hace falta, se hace en el Service dentro de una transacción).

### 5.2 Estructura de carpetas

```
gastos/
├── AGENT.md · AGENTS.md · ARCHITECTURE.md · CHECKPOINT.md · README.md
├── package.json · .gitignore · .env.example
├── assets/css/                       # estilos (variables, reset, layout, components)
├── context-checkpoints/              # ITER-XXX-YYYYMMDD-HHMM.md (versionado)
├── data/                             # gastos.db (IGNORADO en git)
├── backups/                          # backups de la BD (IGNORADO en git)
├── docs/
│   ├── CONTEXT.md · PROJECT_STATE.md · QA_RESULTS.md · SESSION.md
│   ├── Context_live.md (IGNORADO) · Context_live.template.md
│   ├── API.md · DATABASE.md · SECURITY.md · DEPLOYMENT.md
│   └── specs/ (README.md · SPEC-000-plantilla.md · SPEC-XXX-*.md)
├── scripts/                          # migrate, create-user, rates-refresh, backup-db,
│                                     # gen-context-live, check-docs-consistency
├── server/
│   ├── index.js                      # http.createServer + shutdown SIGINT/SIGTERM
│   ├── bootstrap.js                  # DI manual
│   ├── app.js                        # createApp(deps) + headers de seguridad
│   ├── router.js                     # router propio (404 / 405 con Allow)
│   ├── config/index.js               # defaults + variables GASTOS_*
│   ├── database/
│   │   ├── sqlite.js                 # openDatabase() con PRAGMA
│   │   ├── applyMigrations.js
│   │   └── migrations/NNN_nombre.js
│   ├── middleware/auth.js            # requireAuth · requireSpace
│   ├── repositories/*Repository.js
│   ├── routes/*.js                   # [ { method, path, handler } ]
│   ├── services/*Service.js
│   └── utils/                        # errors · http · logger · rateLimiter · money · fx
├── src/                              # cliente
│   ├── app.js                        # bootstrap + router por hash
│   ├── config/app.js
│   ├── models/ services/ controllers/ views/ components/
├── tests/
│   ├── run-all.js · unit/ · integration/ · e2e/run-e2e.js
└── index.html                        # único HTML (SPA)
```

### 5.3 Patrones obligatorios

| Patrón | Ubicación | Garantía |
|---|---|---|
| **DI manual** | `server/bootstrap.js` | un solo lugar construye todo; testeable con dobles |
| **Repository** | `server/repositories/*` | SQL encapsulado |
| **Service** | `server/services/*` | reglas de negocio y transacciones atómicas |
| **Puerto/Adaptador** | `server/services/rates/` | proveedores de cotización intercambiables (§8) |
| **Errores tipados** | `server/utils/errors.js` | una sola forma de error y de respuesta |
| **Bootstrap + shutdown** | `server/index.js` | cierre limpio de SQLite al recibir señal |

### 5.4 Orden obligatorio del bootstrap

```
createConfig → makeLogger → openDatabase → applyMigrations → repositories
            → services → createApp(deps) → http.createServer(app).listen
```

---

## 6. Modelo de datos

Reglas de esquema: IDs `TEXT` con `randomUUID()`, fechas de negocio `TEXT` `YYYY-MM-DD`,
marcas de tiempo `TEXT` ISO-8601 UTC, **dinero siempre `INTEGER`** (centavos), FKs con
`ON DELETE RESTRICT` (nada se borra en cascada si hay movimientos), booleanos `INTEGER` 0/1.

```sql
users(id PK, email UNIQUE NOT NULL, password_hash, password_salt, password_iterations,
      name, base_currency DEFAULT 'GTQ', timezone DEFAULT 'America/Guatemala',
      active DEFAULT 1, created_at, updated_at)

sessions(token PK, user_id FK users, created_at, expires_at, ip, user_agent)

spaces(id PK, owner_user_id FK users, name, created_at, updated_at)

space_members(space_id FK, user_id FK, role CHECK IN ('owner','editor','viewer'),
              created_at, PRIMARY KEY(space_id, user_id))

accounts(id PK, space_id FK spaces, name, type CHECK IN ('cash','debit','credit'),
         currency CHECK IN ('GTQ','USD'), opening_balance_cents INTEGER NOT NULL DEFAULT 0,
         archived INTEGER DEFAULT 0, created_at, updated_at)

categories(id PK, space_id FK spaces, name, kind CHECK IN ('expense','income'),
           parent_id FK categories NULL, color, icon, archived INTEGER DEFAULT 0,
           created_at, updated_at, UNIQUE(space_id, kind, name))

transactions(id PK, space_id FK spaces, account_id FK accounts, category_id FK categories NULL,
             kind CHECK IN ('expense','income','transfer'),
             amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
             currency TEXT NOT NULL, fx_rate_micro INTEGER NULL,
             amount_base_cents INTEGER NOT NULL, rate_date TEXT NULL,
             rate_source TEXT CHECK IN ('base','er-api','banguat','manual') NULL,
             occurred_on TEXT NOT NULL, description, notes, transfer_group_id TEXT NULL,
             created_by FK users, created_at, updated_at)

budgets(id PK, space_id FK spaces, category_id FK categories, period_year INTEGER,
        period_month INTEGER CHECK(period_month BETWEEN 1 AND 12),
        amount_base_cents INTEGER NOT NULL, currency DEFAULT 'GTQ', created_at, updated_at,
        UNIQUE(space_id, category_id, period_year, period_month))

recurring_rules(id PK, space_id FK spaces, account_id FK accounts, category_id FK categories,
                kind CHECK IN ('expense','income'),
                amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), currency,
                description, frequency CHECK IN ('monthly','weekly','biweekly','yearly'),
                day_of_month INTEGER NULL, weekday INTEGER NULL, start_on TEXT NOT NULL,
                end_on TEXT NULL, next_run_on TEXT NOT NULL, active INTEGER DEFAULT 1,
                created_at, updated_at)

recurring_runs(id PK, rule_id FK recurring_rules, period_key TEXT NOT NULL,
               transaction_id FK transactions, generated_on TEXT,
               UNIQUE(rule_id, period_key))          -- idempotencia (I-06)

exchange_rates(id PK, rate_date TEXT NOT NULL, base_currency, quote_currency,
               rate_micro INTEGER NOT NULL,                  -- tasa x 1.000.000
               source CHECK IN ('er-api','banguat','manual'), is_manual INTEGER DEFAULT 0,
               fetched_at TEXT NOT NULL,
               UNIQUE(rate_date, base_currency, quote_currency, source))

audit_log(id PK, space_id FK, user_id FK users, entity, entity_id, action, before_json,
          after_json, created_at)
```

### 6.1 Índices obligatorios

```sql
transactions(space_id, occurred_on)        -- reportes del mes
transactions(space_id, category_id)        -- presupuestos vs real
transactions(transfer_group_id)            -- patas de transferencia
accounts(space_id, archived)
categories(space_id, kind, archived)
exchange_rates(base_currency, quote_currency, rate_date DESC)
sessions(expires_at)                       -- limpieza de sesiones
recurring_rules(active, next_run_on)       -- procesamiento de recurrentes
```

### 6.2 Migraciones

- Archivos numerados `server/database/migrations/NNN_nombre.js` exportando `{ id, up(db) }`.
- `applyMigrations()` es **idempotente**: registra lo aplicado en la tabla `schema_migrations`
  y nunca re-ejecuta una migración ya aplicada.
- Una migración **nunca** se edita después de aplicada en producción: se agrega una nueva.

---

## 7. Invariantes de negocio (no negociables)

Cada invariante tiene su verificación. Si un test falla, **el código está mal**, no el invariante.

| ID | Invariante | Verificación |
|----|------------|--------------|
| **I-01** | **El dinero nunca es coma flotante.** Todo monto es `INTEGER` en centavos. | Test que inspecciona `PRAGMA table_info` y falla si alguna columna monetaria es `REAL`. |
| **I-02** | **La conversión usa aritmética entera** con `rate_micro` (tasa × 1.000.000) y redondeo *half-up* documentado. | Test de conversión con casos de redondeo exacto (p. ej. 7,703054). |
| **I-03** | **La cotización se congela al registrar.** `amount_base_cents`, `fx_rate_micro`, `rate_date` y `rate_source` se escriben una vez y **no se recalculan nunca**. | Test: cambiar la tasa del día y verificar que los totales históricos no se mueven ni un centavo. |
| **I-04** | **Una transferencia no es gasto ni ingreso.** Genera dos patas unidas por `transfer_group_id`, nunca suma a los totales de gasto/ingreso y conserva el mismo valor en moneda base. | Test de totales con una transferencia presente. |
| **I-05** | **Nada con movimientos se borra: se archiva.** Cuentas y categorías pasan a `archived = 1`. | Test: intentar borrar una cuenta con transacciones → rechazo con `ConflictError`. |
| **I-06** | **Los recurrentes son idempotentes.** Un período se genera una sola vez por regla (`UNIQUE(rule_id, period_key)`). | Test: ejecutar el generador dos veces y contar transacciones. |
| **I-07** | **Aislamiento por espacio.** Toda consulta filtra por `space_id`; ninguna operación cruza espacios. | Test de no-fuga: usuario/espacio A no ve ni modifica datos del espacio B (404, no 403 con datos). |
| **I-08** | **Los montos son positivos**; el signo lo determina `kind` (`expense`/`income`/`transfer`). | Test: `amount_cents = 0` o negativo → `ValidationError`. |
| **I-09** | **Fechas de negocio en `America/Guatemala`.** `occurred_on` es `YYYY-MM-DD` según esa zona; `created_at`/`updated_at` en UTC ISO-8601. | Test con hora cercana a medianoche UTC. |

### 7.1 Invariantes de calidad asociados

- **I-10** Ninguna respuesta de la API expone `password_hash`, `password_salt` ni tokens de otros usuarios.
- **I-11** Toda mutación de dinero queda registrada en `audit_log` (acciones sobre cuentas, categorías, transacciones, presupuestos y recurrentes).
- **I-12** Los logs **nunca** contienen montos, descripciones ni emails (§9.5).

---

## 8. Multimoneda y cotizaciones

### 8.1 Reglas

- **Moneda base: `GTQ`** (`GASTOS_BASE_CURRENCY`, configurable). Todo reporte y todo presupuesto
  se expresa en moneda base.
- Monedas soportadas en el MVP: **GTQ** y **USD**.
- Cada transacción guarda **su moneda**, su monto original y la conversión **congelada** (I-03).
- **Nunca** se convierte "al vuelo" al mostrar: se muestra `amount_base_cents` guardado y se
  puede ver el detalle (`amount_cents` + `currency` + tasa + fecha + fuente).

### 8.2 Fuentes de cotización (verificadas)

| Orden | Fuente | Formato | Cobertura | Notas verificadas |
|---|---|---|---|---|
| 1 | `open.er-api.com/v6/latest/USD` | JSON, **sin API key** | los 7 días | devuelve `GTQ`; actualización diaria ~00:02 UTC; atribución a exchangerate-api.com |
| 2 | Banguat `https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx` | **SOAP/XML** | solo días hábiles | método `TipoCambioDia`; el XML exacto de respuesta **debe validarse contra el servicio en vivo antes de escribir el adapter** |
| 3 | Manual | UI | siempre | el usuario fija la tasa; queda `rate_source = 'manual'` |

**Descartadas con evidencia:** `api.frankfurter.app` (responde 404 para GTQ, el BCE no publica
quetzales) y `api.exchangerate.host` (exige `access_key`).

### 8.3 Cadena de resolución (puerto/adaptador)

```
RateProviderPort  ←  ErApiRateProvider   (primaria)
                  ←  BanguatRateProvider (secundaria)
                  ←  ManualRateProvider  (override del usuario)
```

Orden al necesitar la tasa del día:
1. **Caché** en `exchange_rates` para esa fecha y par de monedas (con `source` no manual).
2. **Primaria** (`open.er-api.com`).
3. Si falla o el valor es **fuera de rango de cordura** (±20 % respecto de la última tasa
   conocida), **secundaria** (Banguat).
4. Si ninguna responde: **carry-forward** de la última tasa conocida, conservando su `rate_date`
   original (para que se vea que no es de hoy).
5. Si no hay ninguna tasa disponible: **se exige carga manual**; la app **nunca inventa** una tasa.

### 8.4 Refresco

- `npm run rates:refresh` consulta y persiste la tasa del día.
- El servidor refresca al arrancar si la última tasa es anterior a hoy (sin bloquear peticiones).
- El refresco **nunca** ocurre dentro de la petición de registro de una transacción.
- `/api/health` reporta `rates`: `ok` (≤ 24 h) · `stale` (> 24 h) · `missing` (sin datos).

---

## 9. Seguridad

Contexto obligatorio: la app se publica por **Tailscale Funnel**, es decir, **internet público**
(no solo la tailnet). La autenticación **no es opcional**.

### 9.1 Contraseñas

- Se reutiliza el **`PasswordService`** ya probado en proyectos previos: **PBKDF2-SHA512**,
  **100 000 iteraciones**, **salt de 32 bytes**, clave de 64 bytes, vía WebCrypto.
- Comparación **en tiempo constante**; nunca se registra ni se devuelve el hash ni el salt.

### 9.2 Sesiones

- Token: `randomBytes(32).toString('hex')`, guardado en `sessions` con `expires_at`.
- Cookie: **`gastos_session`**, `HttpOnly`, **`Secure`**, `SameSite=Lax`, `Path=/gastos`
  (configurable con `GASTOS_SESSION_COOKIE` / `GASTOS_COOKIE_SECURE`).
- TTL: 12 h por defecto (`GASTOS_SESSION_TTL_MINUTES`), renovación al usar; token rotado en cada login.
- Logout invalida el token en la BD (no basta con borrar la cookie).

### 9.3 Límite de intentos

- Login: máximo **5 intentos por 15 minutos** por IP + email (patrón `RateLimiter` propio).
- Respuesta **genérica** ante credenciales inválidas: nunca revelar si el email existe.

### 9.4 Forma única de error

```json
{ "error": "mensaje en español", "code": "CODIGO_MAQUINA", "status": 422 }
```

`401` sin sesión · `403` sesión válida sin permiso · `404` recurso inexistente **o de otro
espacio** (no se filtra la existencia) · `409` conflicto · `422` validación · `429` rate limit · `500` inesperado.

### 9.5 Logs

**Prohibido** loggear montos, descripciones, emails, tokens o cualquier dato del usuario.
Se registra: método, ruta, código de estado, duración en ms y un identificador de correlación.

### 9.6 CSRF y cabeceras

- Cookie `SameSite=Lax` + verificación de `Origin` en peticiones mutantes.
- Cabeceras obligatorias: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'self'`.

### 9.7 Inyección y XSS

- **SQL**: siempre `prepare()` con parámetros. **Prohibido** concatenar SQL con datos del usuario.
- **XSS**: todo dato del usuario se escapa antes de insertarse en el DOM; prohibido
  `innerHTML` con datos del usuario (se usa `textContent` o un `escapeHtml()` explícito).

### 9.8 Secretos

- Configuración por variables de entorno con prefijo `GASTOS_*`; el `.env` **no** se versiona
  (`.gitignore`) y en producción va `chmod 600`.
- Prohibido hardcodear tokens, correos o contraseñas en el repositorio o en los scripts.

---

## 10. Despliegue

### 10.1 Cómo se publica

```
Internet → Tailscale Funnel  https://thinkpad.tail60dd6a.ts.net  (ruta: / → 127.0.0.1:8000)
         → nginx :8000  (vhost activo /etc/nginx/sites-enabled/quimica)
         → location /gastos/  →  http://127.0.0.1:8100
         → gastos.service (systemd) → node server/index.js
```

**Estado verificado el 2026-09-20:** Funnel `/` → `127.0.0.1:8000`; vhost activo con
`location /quimica/` → `:5001` y `location /` → `:8001`; **no existen** `gastos.service`,
`/opt/gastos` ni el usuario `gastos`; el puerto **8100 está libre**.

### 10.2 Por qué `location` de nginx y NO una ruta del Funnel (ADR-005)

Evidencia medida: `~/apps-locales/quimica/watchdog.sh` corre por cron `*/5 * * * *` y su función
`restart_funnel()` ejecuta `tailscale funnel --https=443 off` seguido de `tailscale funnel --bg 8000`,
es decir **borra todas las rutas del Funnel** y deja solo `/`. Una ruta `/gastos` en el Funnel
**desaparecería** en la siguiente recuperación (es lo que pasó con `/microwhatsapp` en
adoniz-acer: `runbooks/nginx-funnel-8080-refused.md`). Como `location` de nginx, `/gastos/`
sobrevive porque **no depende del Funnel**.

### 10.3 Requisito de URL (obligatorio para el código)

El `proxy_pass` con barra final **quita el prefijo**, así que la app recibe `/api/...`. En consecuencia:

1. **Router del cliente por hash** (`/#/transacciones`): la profundidad de la URL nunca cambia.
2. **Todas las llamadas y assets en rutas relativas** (`api/health`, `assets/css/main.css`).
3. `GASTOS_BASE_PATH` existe solo como override opcional; el código **no debe depender** de él.

Si cualquiera de estas reglas se rompe, la app funciona en `localhost` y **falla detrás del prefijo**.

### 10.4 Unidad systemd (plantilla a instalar en la fase de despliegue)

```ini
[Unit]
Description=Gastos - administrador de gastos personales
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gastos
Group=gastos
WorkingDirectory=/opt/gastos
EnvironmentFile=/opt/gastos/.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/gastos/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Prohibido usar `PrivateTmp` o `ProtectSystem` (en este equipo producen el error 226 NAMESPACE,
ya documentado) y `DynamicUser` (la app necesita escribir `data/`).

### 10.5 Procedimiento de despliegue (con verificación obligatoria)

1. **Backup del vhost**: `sudo cp /etc/nginx/sites-enabled/quimica /etc/nginx/sites-enabled/quimica.bak-YYYYMMDD`
2. Crear `/opt/gastos/.env` (`GASTOS_PORT=8100`, `GASTOS_HOST=127.0.0.1`, `GASTOS_BASE_PATH=/gastos`, secretos) con `chmod 600`.
3. Crear usuario y directorio: `sudo useradd --system --home /opt/gastos --shell /usr/sbin/nologin gastos`.
4. Copiar el código, `npm run migrate`, `npm run user:create`, y `chown -R gastos:gastos /opt/gastos`.
5. Instalar la unidad systemd, `daemon-reload`, `enable --now gastos.service`.
6. **Agregar el `location /gastos/` de forma aditiva** al vhost (sin tocar `/quimica/` ni `/`),
   `pkexec nginx -t` y recargar nginx.
7. **Verificar, en este orden** (si un paso falla, se revierte):
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8100/api/health` → **200**
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/quimica/` → **200** (no romper Química)
   - `curl -s -o /dev/null -w '%{http_code}' https://thinkpad.tail60dd6a.ts.net/gastos/api/health` → **200**
8. `npm run context:live` para reflejar el estado real.

> En esta máquina `sudo` **pide contraseña**: los cambios de sistema se hacen con **`pkexec`**
> (patrón ya validado en el despliegue de zeroQA).

### 10.6 Backup y restauración

- `npm run backup:db` ejecuta `sqlite3 data/gastos.db ".backup 'backups/gastos-YYYYMMDD-HHMM.db'"`.
  **Nunca** `cp` con la aplicación escribiendo.
- Retención: 30 diarios + 12 mensuales. `backups/` está fuera de git.
- Restaurar: detener el servicio → reemplazar `data/gastos.db` → arrancar → verificar `/api/health`
  y **un total conocido** (contra el backup anterior).

### 10.7 Rollback

- **Código**: `git checkout <tag>` en `/opt/gastos` + `systemctl restart gastos`.
- **nginx**: restaurar el `.bak` del vhost y recargar. **El Funnel no se toca nunca.**
- **BD**: restaurar el backup. Las migraciones **no** se revierten a mano: se agrega una migración correctiva.

### 10.8 Riesgos de despliegue

| Riesgo | Evidencia | Mitigación |
|---|---|---|
| Romper Química al tocar nginx | incidente 2026-09-14/15 (`runbooks/nginx-funnel-8080-refused.md`) | edición **aditiva** + backup + verificar `/quimica/` en 200 |
| El watchdog borra rutas del Funnel | `watchdog.sh` → `restart_funnel()` | no usar rutas del Funnel (ADR-005) |
| Disco `/home` al 86 % | medido 2026-09-20 con `df -h /home` | vigilar; los backups crecen aunque el `.db` sea pequeño |
| `sudo` con contraseña | `sudo -n true` falla | usar `pkexec` |
| Un solo escritor en SQLite | naturaleza de SQLite | WAL + `busy_timeout=5000`; un único proceso |

---

## 11. Testing y validación

### 11.1 Pirámide y herramientas

| Nivel | Ubicación | Qué verifica | Comando |
|---|---|---|---|
| Unitario | `tests/unit/` | `utils/money`, `utils/fx`, servicios con repositorios dobles | `npm test` |
| Integración | `tests/integration/` | repositorios + migraciones + transacciones contra **BD temporal** | `npm test` |
| Contrato | `tests/integration/` | forma de la respuesta de cada ruta (`{ error, code, status }`) | `npm test` |
| E2E | `tests/e2e/` | flujos reales en navegador (Playwright) contra el servidor local | `npm run test:e2e` |
| Consistencia documental | `scripts/check-docs-consistency.js` | §13 | `npm run check:docs` |

Runner propio (`tests/run-all.js`) **sin dependencias**, con el mismo enfoque de shim DOM usado en proyectos previos.

### 11.2 Reglas

- **1:1**: cada criterio de aceptación (Given/When/Then) de la spec activa tiene **al menos un test** identificado por su código `AC-XX`.
- Las pruebas usan una **BD temporal desechable**; jamás `data/gastos.db`.
- Prohibido depender de la fecha real: el reloj **se inyecta** (parámetro `now`).
- Prohibido el orden entre tests: cada uno prepara su propio estado.
- Una iteración **no se cierra** con tests en rojo ni con `check:docs` en rojo.

### 11.3 Pruebas financieras obligatorias (no opcionales)

| Prueba | Invariante |
|---|---|
| Ninguna columna monetaria es `REAL` | I-01 |
| Conversión con `rate_micro` y redondeo half-up en casos límite | I-02 |
| Cambiar la tasa del día **no** altera totales históricos | I-03 |
| Una transferencia no suma a gasto ni a ingreso | I-04 |
| Borrar cuenta/categoría con movimientos → `409` | I-05 |
| Generar recurrentes dos veces → una sola transacción por período | I-06 |
| El espacio A no ve ni modifica datos del espacio B | I-07 |
| Totales por categoría = total del mes (cuadre al centavo) | objetivo §2.3 |
| `occurred_on` correcto cerca de medianoche UTC | I-09 |

---

## 12. Convenciones

### 12.1 Idioma

| Artefacto | Idioma |
|---|---|
| Identificadores de código (clases, funciones, variables, tablas, columnas, endpoints) | **inglés** (como en los proyectos previos) |
| UI, mensajes de error, documentos, commits y este `AGENT.md` | **español** |

### 12.2 Nombres

- Clases `PascalCase` (`TransactionService`, `ExchangeRateService`).
- Archivos y funciones `camelCase` (`buildSummary`, `applyMigrations`).
- Tablas y columnas `snake_case` (`transfer_group_id`).
- Constantes `UPPER_SNAKE_CASE` (`RATE_MICRO_SCALE = 1_000_000`).
- Endpoints plurales en kebab: `/api/accounts`, `/api/categories`, `/api/transactions`, `/api/transfers`, `/api/budgets`, `/api/recurring`, `/api/rates`, `/api/reports/summary`, `/api/auth/login`, `/api/auth/logout`, `/api/health`.
- Repositorios `<Entidad>Repository`, servicios `<Entidad>Service`, vistas `<Entidad>View`, controladores de cliente `<Entidad>Controller`.

### 12.3 Estilo de código

- ES Modules nativos (`import`/`export`), sin `require`.
- Prohibido `var`, `==` laxo, `eval`, `innerHTML` con datos del usuario.
- Constantes nombradas: **prohibidos los números mágicos** (incluida la escala de la tasa).
- JSDoc obligatorio en funciones y clases públicas.
- Funciones cortas y con una responsabilidad; si un `Service` pasa de ~200 líneas, se divide.
- Sin `console.log` de datos del usuario; se usa el logger del proyecto.

### 12.4 Commits y ramas

- **Atómicos** y en **imperativo español**: `agrega repositorio de transacciones`, `corrige redondeo en fx`.
- Un commit = un cambio lógico con sus tests. Prohibido mezclar refactor con funcionalidad.
- Rama principal `main`; cambios por rama corta y descripción explícita del cambio.
- `.env` **nunca** se commitea.

### 12.5 Formatos de presentación

- Dinero con `Intl.NumberFormat('es-GT', { style: 'currency', currency })` → `Q1,234.56` / `$1,234.56`.
- Fechas en UI `dd/MM/yyyy`; en API y BD `YYYY-MM-DD` (negocio) o ISO-8601 UTC (marcas).
- Todos los montos muestran su moneda cuando el contexto no sea obvio.

---

## 13. Documentos vivos, checkpointing y contrato anti-contradicción

### 13.1 Documentos y cuándo se actualiza cada uno

| Documento | Rol | Se actualiza |
|---|---|---|
| `AGENT.md` | contrato operativo (este archivo) | al cambiar alcance, reglas, stack o despliegue |
| `ARCHITECTURE.md` | capas, esquema, ADRs | al tomar una decisión arquitectónica |
| `CHECKPOINT.md` | **estado del proyecto** (versionado) | al cerrar iteración, al 80 % de contexto o a pedido |
| `context-checkpoints/ITER-XXX-YYYYMMDD-HHMM.md` | historial de checkpoints | en cada checkpoint (retención: 50 FIFO) |
| `docs/CONTEXT.md` | dominio, glosario, reglas | al cambiar reglas o convenciones |
| `docs/PROJECT_STATE.md` | tareas, métricas, deuda, riesgos | al cerrar iteración |
| `docs/QA_RESULTS.md` | historial de QA | tras cada ciclo de pruebas |
| `docs/SESSION.md` | log de la sesión actual | durante la sesión |
| `docs/Context_live.md` | **estado de infraestructura** (local, **fuera de git**) | generado por script; nunca a mano |
| `docs/specs/SPEC-XXX.md` | contrato de cada módulo | antes de codificar y ante cambios |

### 13.2 Protocolo de checkpointing

| Umbral / disparador | Acción |
|---|---|
| **70 %** de contexto | **resumen preventivo** (sin re-leer el proyecto) |
| **80 %** de contexto | **checkpoint obligatorio** (no se continúa sin completarlo) |
| Usuario dice *"checkpoint"* / *"guarda progreso"* | ejecuta los pasos 2-5 sin esperar al 80 % |

**Protocolo de 5 pasos:** (1) pausa y aviso `CHECKPOINT: contexto al N%. Documentando…`; (2) re-lectura objetiva del proyecto (`git status --short`, `git diff --stat`, archivos modificados); (3) crear `context-checkpoints/ITER-XXX-YYYYMMDD-HHMM.md`; (4) resumen ejecutivo de 200-500 tokens (hecho, estado, próximo paso); (5) inyectar el bloque `=== CHECKPOINT DE CONTINUIDAD ===` y reanudar.

**Re-hidratación al iniciar sesión:** leer el último checkpoint + `CHECKPOINT.md` + los 4 vivos → resumen integrado → **confirmar con el usuario**: *"Reanudando desde checkpoint [fecha]. ¿Se continúa?"*

**Retención:** el checkpoint de la sesión activa siempre; en total los últimos **50** (FIFO). Los 4 vivos son permanentes.

### 13.3 Dueño único de cada dato

| Dato | Dueño |
|---|---|
| Fase, iteración, módulos, tareas, specs, tests, próximo paso, riesgos **de trabajo** | `CHECKPOINT.md` |
| Servicio, usuario, puerto, ruta nginx, URL pública, salud, BD, cotizaciones, backups, riesgos **de infraestructura** | `docs/Context_live.md` |
| Commit de trabajo (HEAD del repo) | `CHECKPOINT.md` |
| Versión **desplegada** en `/opt/gastos` | `docs/Context_live.md` |

El resto de los documentos **referencian**, nunca copian.

### 13.4 Contrato anti-contradicción (7 reglas)

1. **Un dato, un dueño.** Un campo ajeno se **referencia** (`→ ver docs/Context_live.md`), no se copia.
2. **Precedencia:** discrepancia sobre runtime/infra → gana `docs/Context_live.md` (dato medido); sobre el proyecto → gana `CHECKPOINT.md`. La discrepancia **se reporta**, no se "arregla" en silencio.
3. `docs/Context_live.md` **se genera**, nunca se edita a mano.
4. `CHECKPOINT.md` **se escribe**, nunca se genera.
5. **Marcadores de bloque**: el generador escribe solo entre `<!-- BEGIN GENERADO -->` y `<!-- END GENERADO -->`; las notas manuales van fuera y **sobreviven** a la regeneración.
6. **Marca de frescura**: el archivo generado incluye fecha, `Estado: fresco | stale (>24h)` y el comando de regeneración. `CHECKPOINT.md` **no puede** afirmar "desplegado" si `Context_live.md` está `stale`.
7. **Prohibiciones cruzadas verificables**: `Context_live.md` no puede contener "próximo paso", "módulos" ni "tests"; `CHECKPOINT.md` no puede contener estado de servicio, puerto, URL ni salud. Ninguno usa la etiqueta genérica "Última actualización".

### 13.5 Verificación automatizada

`npm run check:docs` (`scripts/check-docs-consistency.js`):

- compara la **lista blanca de claves compartidas** entre ambos documentos (`Servicio`, `Puerto interno`, `URL pública`, `Hostname`) y exige valores idénticos;
- contrasta contra la realidad: `systemctl show gastos -p ActiveState`, `ss -tlnp` en el puerto, `curl` al health interno y `nginx -T` para `location /gastos`;
- falla si `CHECKPOINT.md` afirma despliegue y el health no responde o `Context_live.md` supera las 24 h;
- falla si aparece cualquiera de las prohibiciones de la regla 7;
- sale con código **1** y detalle exacto del conflicto.

---

## 14. Flujo SDD obligatorio (spec antes que código)

### 14.1 Secuencia por módulo

1. Escribir `docs/specs/SPEC-XXX-<nombre>.md` con la plantilla `SPEC-000`.
2. Completar el **checklist de spec** (§14.2) y obtener **aprobación explícita del usuario**.
   Gate: `SPEC_READY = true`.
3. **Red**: escribir los tests derivados de los criterios de aceptación; deben fallar.
4. **Green**: implementar el mínimo que los hace pasar.
5. **Refactor**: limpiar sin cambiar comportamiento; tests siguen verdes.
6. Actualizar `CHECKPOINT.md`, `docs/PROJECT_STATE.md` y `docs/QA_RESULTS.md`.

### 14.2 Checklist de spec (obligatorio antes de codificar)

```
[ ] Problema entendido sin contexto adicional
[ ] Objetivo binario falsable (se cumple o no se cumple)
[ ] Contexto acotado: usuario real + escenario + limitaciones
[ ] Alcance: "Incluye" y "No incluye" (ninguno vacío)
[ ] Comportamiento: flujo principal + alternativos + casos límite
[ ] Criterios de aceptación en Given/When/Then, binarios
[ ] Al menos 1 ejemplo ejecutable por flujo crítico
[ ] Restricciones técnicas, de negocio y de seguridad explícitas
[ ] Trazabilidad: id, specs relacionadas, ADRs relacionados
[ ] Firmado: dueño del producto + responsable técnico
```

### 14.3 Reglas

- **La spec es el contrato único de verdad**: código, tests y documentación derivan de ella.
- **Validación contra la spec, no contra opiniones**: al cerrar el módulo, el 100 % de los AC debe pasar.
- **Trazabilidad**: cada AC tiene test y código que lo implementan; se puede nombrar el archivo.
- **Cambiar una spec ya aprobada exige**: análisis de impacto, versión nueva (SemVer) y aprobación.

### 14.4 Anti-patrones prohibidos

Codificar sin spec · spec sin "No incluye" · objetivo con verbos no verificables ("mejorar", "optimizar") ·
criterios de aceptación sin Given/When/Then · tests escritos después y "adaptados" para pasar ·
interpretar un requisito ambiguo en lugar de preguntar.

---

## 15. Decisiones cerradas (Fase 0)

| # | Tema | Decisión cerrada |
|---|---|---|
| 1 | Producto | Uso **personal, un dueño**, con modelo **multi-tenant-ready** (`user_id` + `space_id` desde el día 1) |
| 2 | Stack | **Node 22 + `node:sqlite` + MVC vanilla JS**, sin build y sin dependencias de runtime |
| 3 | Cliente | **Web en línea, sin PWA y sin offline**; mobile-first |
| 4 | Alcance MVP | Cuentas múltiples, categorías, gastos/ingresos, transferencias, presupuestos mensuales, recurrentes y reportes del mes |
| 5 | Publicación | **systemd + `location /gastos/` en el vhost nginx `:8000`** → `127.0.0.1:8100`; **el Funnel no se toca** |
| 6 | Autenticación | Dueño único: email + contraseña (PBKDF2 vía `PasswordService`), cookie de sesión, rate limit, **sin registro público** |
| 7 | Documentación | `AGENT.md` + `AGENTS.md` + `ARCHITECTURE.md` + `CHECKPOINT.md` + los 4+1 vivos + **specs SDD por módulo** |
| 8 | Moneda | **GTQ base** (configurable) + **USD**; cotización **congelada al registrar** |
| 8b | Cotizaciones | **`open.er-api.com` primaria** (7 días) · **Banguat secundaria** (SOAP, días hábiles) · override manual · `rate_source` auditable |
| 9 | Contexto | `context-checkpoints/` + `CHECKPOINT.md` + 4 vivos; `docs/Context_live.md` **fuera de git** |

### 15.1 Decisiones operativas derivadas

| Tema | Valor |
|---|---|
| Nombre del documento canónico | `AGENT.md`, con `AGENTS.md` como puntero para autoload |
| Prefijo de variables de entorno | `GASTOS_*` |
| Puerto interno | **8100** (verificado libre el 2026-09-20) |
| Zona horaria de negocio | `America/Guatemala` |
| Umbrales de contexto | 70 % resumen preventivo · 80 % checkpoint obligatorio (skill A-context-manager) |
| Meses cerrados inmutables | **fuera del MVP** (fase 2) |
| Repositorio remoto | **no creado** en Fase 0 (solo `git init` local) |

---

## 16. Riesgos, supuestos y límites

### 16.1 Supuestos

- Un solo usuario real; si aparece un segundo, el modelo ya lo soporta (`space_members`) pero la UI no.
- El uso es **en línea** y desde Guatemala, en GTQ y USD.
- La máquina de despliegue (ThinkPad) está encendida y con Tailscale activo; **no hay alta disponibilidad**.
- El dispositivo del usuario tiene navegador moderno; no se soportan navegadores antiguos.

### 16.2 Límites conocidos (se documentan, no se esconden)

| Límite | Consecuencia |
|---|---|
| SQLite con un solo escritor | no apto para muchas escrituras concurrentes; es aceptable para uso personal |
| `node:sqlite` es **experimental** en Node 22 | la API puede cambiar; por eso todo el acceso está aislado en `server/database/sqlite.js` |
| Dependencia de un tercero **gratuito** para la tasa (open.er-api.com) | puede cambiar sus condiciones; mitigado con Banguat + carry-forward + manual |
| Banguat publica solo **días hábiles** | fines de semana y feriados usan la última tasa conocida (con su fecha real) |
| Sin modo offline | si no hay red, no se registra nada |
| Sin bloqueo de meses cerrados | un mes pasado puede editarse (fase 2) |
| Una sola máquina, sin replicación | si el equipo cae, la app no está disponible (los datos sobreviven en el backup) |

### 16.3 Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Errores de redondeo acumulados | totales que no cuadran | aritmética entera (I-02) + pruebas de cuadre obligatorias |
| Fuga de datos entre espacios (futuro multiusuario) | privacidad | filtro `space_id` obligatorio + test de no-fuga (I-07) |
| Cambio silencioso de una tasa histórica | reportes mentirosos | congelamiento (I-03) + `rate_source`/`rate_date` auditables |
| Romper Química al publicar | caída de otro servicio en producción | `location` aditivo + backup + verificación en 200 (§10.5) |
| Disco `/home` al 86 % | fallo de escritura de la BD | vigilancia y limpieza; backups acotados por retención |
| Divergencia entre `CHECKPOINT.md` y `Context_live.md` | decisiones tomadas con datos falsos | contrato de 7 reglas + `npm run check:docs` |
| Conocimiento solo en la cabeza del agente | pérdida entre sesiones | checkpointing 70/80 + los 4 vivos |

### 16.4 Qué obligaría a cambiar este documento

Cambios de alcance, de stack, de moneda base, del mecanismo de publicación, de la metodología
de contexto o de las invariantes (§7). En ese caso: actualizar `AGENT.md`, dejar constancia en
`ARCHITECTURE.md` (ADR nuevo, marcando el anterior como *superseded*) y anotarlo en el anexo.

---

## Anexo A — Registro de cambios de este documento

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Versión inicial: Fase 0 cerrada con 9 decisiones, invariantes, contrato anti-contradicción y plan de despliegue sin tocar el Funnel. |

---

*Documento interno de referencia. Si algo de acá contradice la realidad medida, gana la realidad:
se corrige el documento en el mismo turno.*
