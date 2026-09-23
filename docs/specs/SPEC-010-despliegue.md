---
spec_id: SPEC-010
titulo: Despliegue y publicación en línea
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-008, SPEC-009]
adrs: [ADR-005]
---

# SPEC-010 — Despliegue y publicación en línea

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

La aplicación **se publica en internet público** a través de Tailscale Funnel. Sin un procedimiento de despliegue documentado y verificado, publicar una nueva versión corre el riesgo de tumbar el servicio, romper otros servicios en la misma máquina (Química), o dejar la app inaccesible. El despliegue requiere coordinación entre nginx, systemd, Tailscale Funnel, y la BD SQLite, con verificación obligatoria en cada paso.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño es administrador de la máquina (thinkpad), con acceso a sudo/pkexec, nginx, systemd, Tailscale |
| Escenario | Se actualiza el código, se reinicia el servicio, se verifica que todo sigue funcionando |
| Limitaciones | La máquina tiene Química corriendo en `:8000` con vhost activo; el watchdog reinicia el Funnel y borra rutas; `sudo` pide contraseña (se usa `pkexec`); disco `/home` al 86 % |
| Riesgo principal | Romper Química al editar nginx, o que el watchdog borre la ruta del Funnel |

## 3. Objetivo (falsable)

> El sistema se despliega siguiendo un procedimiento documentado con **7 pasos de verificación obligatoria**, sin tocar el Funnel, y con capacidad de rollback completo.

**No se cumple si:**

- El procedimiento se ejecuta sin hacer backup del vhost nginx.
- El servicio no responde en `http://127.0.0.1:8100/api/health` → 200 después del despliegue.
- Química deja de responder en `:8000/quimica/` → 200 después del despliegue.
- Se toca una ruta del Funnel.
- No se puede hacer rollback completo.

## 4. Alcance

### 4.1 Incluye

- Cadena de publicación: `Internet → Tailscale Funnel → nginx :8000 → /gastos/ → App (:8100) → systemd`.
- Edición **aditiva** del vhost nginx (`location /gastos/`) sin tocar `/quimica/` ni `/`.
- Unidad systemd (`gastos.service`) con configuración probada.
- Procedimiento de despliegue con 7 pasos y verificación obligatoria.
- **DCA del interruptor de despliegue**: `npm start` (prod) vs `npm run dev` (con `--watch` y migraciones).
- Backup y restauración de la BD SQLite.
- Rollback completo (código, nginx, BD).
- Todos los comandos (`npm start`, `npm run dev`, `npm run migrate`, `npm run user:create`, `npm run rates:refresh`, `npm run backup:db`, `npm run context:live`, `npm test`, `npm run test:e2e`, `npm run check:docs`).
- Verificación post-despliegue en este orden: `:8100/health` → `:8000/quimica/` → `Funnel/gastos/health`.
- Uso de `pkexec` (no `sudo`) para cambios de sistema.
- `npm run context:live` para reflejar estado real en `docs/Context_live.md`.

### 4.2 No incluye

- Configuración de Tailscale ni Funnel (no se toca, ADR-005).
- Configuración de DNS o certificados SSL (maneja Tunnel de Tailscale).
- Escalado horizontal o alta disponibilidad (un solo escritor SQLite, máquina única).
- Monitoreo automático (sin Prometheus, Grafana, etc.) — se usa verificaciones manuales con `curl`.
- CI/CD pipeline (no hay repositorio remoto en el MVP).
- Despliegue automático (todo es manual, bajo demanda).

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — despliegue

1. **Backup del vhost**: se crea `.bak` del vhost actual.
2. Se crea `/opt/gastos/.env` con `GASTOS_PORT=8100`, `GASTOS_HOST=127.0.0.1`, `GASTOS_BASE_PATH=/gastos`, secretos, con `chmod 600`.
3. Se crea usuario `gastos` y directorio `/opt/gastos`.
4. Se copia el código, se ejecuta `npm run migrate`, `npm run user:create`, y se `chown -R gastos:gastos /opt/gastos`.
5. Se instala la unidad systemd, `daemon-reload`, `enable --now gastos.service`.
6. Se agrega `location /gastos/` **de forma aditiva** al vhost (sin tocar `/quimica/` ni `/`), `pkexec nginx -t` y recargar nginx.
7. **Verificación obligatoria** (en orden, si un paso falla se revierte):
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8100/api/health` → **200**
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/quimica/` → **200** (no romper Química)
   - `curl -s -o /dev/null -w '%{http_code}' https://thinkpad.tail60dd6a.ts.net/gastos/api/health` → **200**
8. `npm run context:live` para reflejar el estado real.

### 5.2 Flujo principal — DCA del interruptor

1. **`npm start`** (producción): arranca el servidor sin `--watch` ni migraciones. Solo el servicio systemd lo ejecuta.
2. **`npm run dev`** (desarrollo): arranca con `--watch`. Requiere `npm run migrate` previo para aplicar cambios de schema.
3. El `package.json` aplica el DCA: las rutas `start` y `dev` son **diferentes** y separadas, evitando que `dev` se ejecute en producción o viceversa.
4. El servicio systemd ejecuta exclusivamente `npm start`.

### 5.3 Flujo principal — backup y restauración

1. **Backup**: `npm run backup:db` ejecuta `sqlite3 data/gastos.db ".backup 'backups/gastos-YYYYMMDD-HHMM.db'"`.
2. **Nunca** se usa `cp` con la aplicación escribiendo.
3. **Retención**: 30 diarios + 12 mensuales. `backups/` está fuera de git.
4. **Restaurar**: detener el servicio → reemplazar `data/gastos.db` → arrancar → verificar `/api/health` y **un total conocido** (contra el backup anterior).

### 5.4 Flujo principal — rollback

1. **Código**: `git checkout <tag>` en `/opt/gastos` + `systemctl restart gastos`.
2. **nginx**: restaurar el `.bak` del vhost y recargar. **El Funnel no se toca nunca.**
3. **BD**: restaurar el backup. Las migraciones **no** se revierten a mano: se agrega una migración correctiva.

### 5.5 Flujos alternativos

- **Fallo en paso 7** → se revierte inmediatamente (restaurar `.bak`, `systemctl restart gastos`).
- **Disco lleno** → el backup falla; se libera espacio antes de continuar (vigilar disco `/home`).
- **`sudo` pide contraseña** → usar `pkexec` (patrón validado en zeroQA).

### 5.6 Casos límite

- **Watchdog borra rutas del Funnel** → no usar rutas del Funnel (ADR-005). `/gastos/` es `location` de nginx, sobrevive.
- **`watchdog.sh` reinicia Funnel** → su `restart_funnel()` ejecuta `tailscale funnel --https=443 off` + `--bg 8000`, borrando rutas adicionales. Como `/gastos/` es `location` de nginx, no depende del Funnel.
- **Química deja de funcionar** → nunca editar el vhost sin backup y sin verificar `:8000/quimica/` → 200.
- **Rollback con BD corrupta** → restaurar backup + migración correctiva si es necesario.
- **DCA del interruptor aplicado** → `package.json` separa `start` (prod) de `dev` (con `--watch` y migraciones).

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Despliegue exitoso | el código está listo en `/opt/gastos` | se ejecuta el procedimiento completo (pasos 1-7) | `http://127.0.0.1:8100/api/health` → 200 (paso 7a) |
| AC-02 | Química no afectada | Química responde en `:8000/quimica/` | se ejecuta el procedimiento | `http://127.0.0.1:8000/quimica/` → 200 (paso 7b) |
| AC-03 | URL pública responde | Tailscale Funnel está activo | se ejecuta el procedimiento | `https://thinkpad.tail60dd6a.ts.net/gastos/api/health` → 200 (paso 7c) |
| AC-04 | Backup del vhost creado | el vhost existe | se inicia el procedimiento | `quimica.bak-YYYYMMDD` existe (paso 1) |
| AC-05 | Backup de BD creado | la BD existe en `data/gastos.db` | se ejecuta `npm run backup:db` | archivo `backups/gastos-YYYYMMDD-HHMM.db` existe |
| AC-06 | Restauración de BD | se tiene un backup | se detiene servicio → se reemplaza `.db` → se arranca | `/api/health` → 200 y total conocido coincide |
| AC-07 | Rollback completo | se desplegó una versión con errores | se ejecuta `git checkout <tag>` + `systemctl restart gastos` + restaurar `.bak` | servicio vuelve a la versión anterior, Química responde 200 |
| AC-08 | Sin tocar el Funnel | el Funnel está activo | se ejecuta el procedimiento completo | ninguna ruta del Funnel se modifica (ADR-005) |
| AC-09 | DCA del interruptor | el `package.json` tiene `start` y `dev` separados | se ejecuta `npm start` en producción | arranca sin `--watch` y sin migraciones automáticas |
| AC-10 | `npm run dev` con migraciones | se está en desarrollo | se ejecuta `npm run migrate && npm run dev` | las migraciones se aplican y el servidor arranca con `--watch` |
| AC-11 | Verificación con `pkexec` | se requiere cambio de sistema | se ejecuta `pkexec nginx -t` | la prueba de configuración de nginx pasa |
| AC-12 | `context:live` actualizado | se completó el despliegue | se ejecuta `npm run context:live` | `docs/Context_live.md` refleja el estado real del servicio |
| AC-13 | Retención de backups | se tienen backups | se generan nuevos | se mantienen 30 diarios + 12 mensuales; los más antiguos se eliminan |
| AC-14 | Rollback de BD con migración | se desplegó con nueva migración y hay error | se restaura la BD | las migraciones aplicadas no se revierten; se agrega migración correctiva |
| AC-15 | Servicio systemd activo | la unidad `gastos.service` está instalada | se verifica `systemctl show gastos -p ActiveState` | `ActiveState=active` |

## 7. Ejemplos ejecutables

```bash
# 1. Backup del vhost
sudo cp /etc/nginx/sites-enabled/quimica /etc/nginx/sites-enabled/quimica.bak-20260921

# 2. Crear .env
cat > /opt/gastos/.env << EOF
GASTOS_PORT=8100
GASTOS_HOST=127.0.0.1
GASTOS_BASE_PATH=/gastos
EOF
chmod 600 /opt/gastos/.env

# 3. Crear usuario y directorio
sudo useradd --system --home /opt/gastos --shell /usr/sbin/nologin gastos
mkdir -p /opt/gastos
chown gastos:gastos /opt/gastos

# 4. Copiar código, migrar, crear usuario
cp -r . /opt/gastos/
cd /opt/gastos && npm run migrate && npm run user:create
chown -R gastos:gastos /opt/gastos

# 5. Instalar systemd
sudo cp gastos.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gastos.service

# 6. Agregar location /gastos/ al vhost (aditivo)
pkexec nginx -t && sudo systemctl reload nginx

# 7. Verificación
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8100/api/health        # → 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/quimica/          # → 200
curl -s -o /dev/null -w '%{http_code}' https://thinkpad.tail60dd6a.ts.net/gastos/api/health  # → 200

# 8. Contexto en vivo
npm run context:live

# Backup de BD
npm run backup:db

# Restaurar BD
sudo systemctl stop gastos.service
cp backups/gastos-20260920-1200.db data/gastos.db
sudo systemctl start gastos.service

# Rollback de código
cd /opt/gastos && git checkout v0.1.0
sudo systemctl restart gastos.service

# Rollback de nginx
sudo cp /etc/nginx/sites-enabled/quimica.bak-20260921 /etc/nginx/sites-enabled/quimica
sudo systemctl reload nginx

# DCA del interruptor
npm start                          # producción: sin --watch, sin migraciones
npm run migrate && npm run dev     # desarrollo: con migraciones y --watch
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | El Funnel **nunca** se toca; `/gastos/` es `location` de nginx (ADR-005) |
| Técnica | Edición **aditiva** del vhost nginx; siempre backup previo |
| Técnica | `pkexec` para cambios de sistema (no `sudo` directo) |
| Técnica | `watchdog.sh` borra rutas del Funnel cada 5 min; como `/gastos/` es `location` de nginx, sobrevive |
| Técnica | `node:sqlite` es experimental; todo acceso aislado en `server/database/sqlite.js` |
| Técnica | SQLite con un solo escritor; WAL + `busy_timeout=5000` |
| De negocio | El despliegue está documentado pero **no ejecutado** hasta que exista código funcionando |
| De negocio | La máquina `thinkpad` es el único servidor; sin alta disponibilidad |
| De negocio | Disco `/home` al 86 %; vigilar y limpiar backups |
| De seguridad | `.env` con `chmod 600`; sin hardcodear secretos |
| De seguridad | `NoNewPrivileges=true` en systemd; sin `PrivateTmp` ni `ProtectSystem` |
| De seguridad | El usuario `gastos` no tiene shell (`/usr/sbin/nologin`) |
| De seguridad | El backup usa `sqlite3 .backup`, nunca `cp` con app escribiendo |

## 9. Contratos

Los comandos de despliegue están definidos en `AGENT.md` §4.3:

| Comando | Efecto |
|---|---|
| `npm start` | `node --disable-warning=ExperimentalWarning server/index.js` (producción, sin --watch ni migraciones) |
| `npm run dev` | igual, con `--watch` (desarrollo; requiere `npm run migrate` previo) |
| `npm run migrate` | aplica migraciones pendientes (idempotente) |
| `npm run user:create` | crea/actualiza usuario dueño (CLI) |
| `npm run rates:refresh` | actualiza cotizaciones USD→GTQ |
| `npm run backup:db` | backup consistente con `sqlite3 .backup` |
| `npm run context:live` | regenera `docs/Context_live.md` |
| `npm test` | tests unitarios + integración (`tests/run-all.js`) |
| `npm run test:e2e` | Playwright contra servidor local |
| `npm run check:docs` | verifica consistencia `CHECKPOINT.md` ↔ `docs/Context_live.md` |

**Unidad systemd** (`/etc/systemd/system/gastos.service`):

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

**Procedimiento de despliegue (7 pasos + verificación)**:

| Paso | Acción | Verificación |
|---|---|---|
| 1 | Backup del vhost | `.bak` creado |
| 2 | Crear `.env` | `chmod 600` |
| 3 | Crear usuario/directorio | `gastos` existe |
| 4 | Copiar código, migrar | `npm run migrate` → OK |
| 5 | Instalar systemd | `daemon-reload`, `enable --now` |
| 6 | Agregar `location /gastos/` | `pkexec nginx -t` → OK |
| 7 | Verificar (3 endpoints) | `:8100/health` → 200, `:8000/quimica/` → 200, `Funnel/gastos/health` → 200 |

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones

- ✅ **ADR-005 aplicado**: `/gastos/` es `location` de nginx, no ruta del Funnel. El watchdog no puede borrarla.
- ✅ **DCA del interruptor aplicado**: `package.json` separa `start` (prod) de `dev` (con `--watch`). El DCA está documentado en CHECKPOINT.md (ITER-001).
- ✅ **`pkexec` en vez de `sudo`**: `sudo -n true` falla en esta máquina; se usa `pkexec` (patrón validado en zeroQA).
- ✅ **Backup con `sqlite3 .backup`**: nunca `cp` con app escribiendo (WAL safe).
- ✅ **Retención 30+12**: diarios y mensuales; `backups/` fuera de git.
- ✅ **Migraciones no se revierten**: en rollback de BD, se restaura backup y se agrega migración correctiva si es necesario.
- ✅ **`context:live` post-despliegue**: `docs/Context_live.md` se regenera siempre al final del procedimiento.
- ✅ **Verificación en orden**: `:8100` → `:8000/quimica/` → `Funnel/gastos/health`. Si un paso falla, se revierte.
- ✅ **Sin tocar el Funnel**: el despliegue es 100% nginx + systemd + código.
- ✅ **`NoNewPrivileges=true`**: la unidad systemd no permite escalar privilegios; sin `PrivateTmp` ni `ProtectSystem` (error 226 NAMESPACE).

## 12. Checklist antes de aprobar

```
[x] Problema entendido sin contexto adicional
[x] Objetivo binario falsable
[x] Contexto acotado
[x] "Incluye" y "No incluye" no vacíos
[x] Comportamiento completo (principal + alternativos + límites)
[x] AC en Given/When/Then, binarios
[x] Ejemplos por flujo crítico
[x] Restricciones técnicas, de negocio y de seguridad
[x] Trazabilidad AC → test → código (pendiente de completar al implementar)
[x] Aprobación explícita del dueño (2026-09-21)
```

---

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de despliegue.*
