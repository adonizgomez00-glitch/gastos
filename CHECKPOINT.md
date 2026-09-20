# CHECKPOINT — App de Gastos Personales

> **Último checkpoint de contexto**: 2026-09-20 17:00 · **ITER-001 (en curso)** · Fase 1
> **Archivo de checkpoint**: `context-checkpoints/ITER-001-20260920-1700.md` *(detalle de lo hecho y lo pendiente; el de ITER-000 también existe)*
> **Uso de contexto al cerrar**: ~35 % del límite del modelo
> **Estado de infraestructura**: ver `docs/Context_live.md` (local, **fuera de git**) — acá **no se copia** ningún dato de servicio, puerto o URL

---

## 1. Fase y estado del proyecto

| Campo | Valor |
|---|---|
| Fase | 2 — **ITER-001 (completado)** (suite + Fase C verificadas; DCA del interruptor aplicado (package.json)) |
| Iteración | ITER-001 (completado) |
| Código | Fase A, B y C verificadas en vivo; suite 21/21; DCA del interruptor de despliegue aplicado (package.json) |
| Spec activa | `docs/specs/SPEC-001-autenticacion.md` (**aprobada**, **implementada**, 15 AC en tests, UI mínima de login) |
| Repo | git init + commits (HEAD actual) + etiqueta v0.1.0-iter001 |
| Despliegue | Documentado; no ejecutado; pendiente de SPEC-010 + DCA del interruptor de despliegue.

## 2. Módulos y entregables

| # | Módulo | Spec | Estado |
|---|---|---|---|
| 0 | Documentación de arranque (AGENT.md, ARCHITECTURE.md, 4 vivos) | — | ✅ completada |
| 1 | Autenticación (dueño único) | SPEC-001 | 🔨 implementada (suite 21/21, UI mínima de login, DCA del interruptor aplicado) |
| 2 | Cuentas (efectivo/débito/crédito) | SPEC-002 | ⏳ |
| 3 | Categorías (gasto/ingreso, jerárquicas) | SPEC-003 | ⏳ |
| 4 | Transacciones (gastos e ingresos) | SPEC-004 | ⏳ |
| 5 | Transferencias entre cuentas | SPEC-005 | ⏳ |
| 6 | Presupuestos mensuales por categoría | SPEC-006 | ⏳ |
| 7 | Gastos recurrentes | SPEC-007 | ⏳ |
| 8 | Tipos de cambio GTQ ⇄ USD | SPEC-008 | ⏳ |
| 9 | Reportes del mes | SPEC-009 | ⏳ |
| 10 | Despliegue y publicación en línea | SPEC-010 | ⏳ |

## 3. Tests

| Suite | Resultado | Comando |
|---|---|---|
| Unit + integración | **21 en verde, 0 en rojo** (~1.3 s) | `npm test` |
| E2E (Playwright) | no implementado | `npm run test:e2e` |
| Consistencia de documentos | **implementado** (a validar en cada cierre) | `npm run check:docs` |

## 4. Última actividad completada

- Relevamiento del entorno y de la metodología SAQI (skills Nivel A verificadas en el sistema).
- Cierre de las 9 decisiones de Fase 0 (detalle en `AGENT.md` §15 y `ARCHITECTURE.md` ADR-001..006).
- Verificación empírica del entorno de despliegue (puerto interno, servicio, proxy, entrada
  pública y disco) **registrada en `docs/Context_live.md`**; ningún dato se dio por sabido de memoria.
- Diseño y puesta en marcha del contrato anti-contradicción `CHECKPOINT.md` ↔ `docs/Context_live.md`,
  con **pruebas negativas** del verificador: inyectar una afirmación falsa de despliegue y un token de
  infraestructura en `CHECKPOINT.md` produce `FAIL` y salida `1`; sin ellos, salida `0`.
- **Checkpoint manual (17:00)**: Paso 0 + Fase A + Fase B verificadas en vivo; defecto real de
  `cookiePath` corregido; suite y UI pendientes. Archivo: `context-checkpoints/ITER-001-20260920-1700.md`.
- **Checkpoint (17:32)**: Fase C realizada — SPA mínima de login (index.html, CSS mobile-first, cliente
  con rutas relativas, controlador, vistas con escape), router estático del servidor con protección anti-traversal
  (solo `.js` en `/src`), control de acceso a directorios por lista cerrada. Verificada en vivo y
  `npm test` (21/21 en verde, 1.3 s). Interruptor de despliegue corregido (DCA listo: package.json).

## 5. Próximo paso (uno, verificable)

ITER-001 cerrado.

Proximo: ITER-002 = SPEC-008 (tipos de cambio GTQ ⇄ USD).

> ✅ Aprobada la SPEC-001 (2026-09-20). Orden corregido en `docs/specs/README.md`: auth primero
> (puerta de entrada) y tipos de cambio en ITER-002.

## 6. Riesgos de trabajo

Los riesgos de infraestructura —disco, servicios, red— viven en `docs/Context_live.md`.

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `node:sqlite` es experimental en Node 22 | la API podría cambiar | todo el acceso aislado en `server/database/sqlite.js` |
| Un solo proceso escritor en SQLite | contención si se agrega multiusuario | WAL + `busy_timeout=5000`; documentado como límite |
| Fuente de cotización de terceros (gratuita) | tasa no disponible | Banguat como secundaria + carry-forward + override manual |
| Moneda base GTQ con gastos en USD | redondeo acumulado | aritmética entera con `rate_micro` y redondeo half-up |
| Divergencia entre `CHECKPOINT.md` y `Context_live.md` | decisiones sobre datos falsos | contrato de 7 reglas + `npm run check:docs` |
| **Interruptor de despliegue recién corregido** | regresión accidental al desplegar | **cuarentena**: DCA: cambio `package.json` separa `npm start` prod de `npm run dev` con migraciones; validar antes de próximo commit a `docs/`. X-ref checkpoint 20260920-1732. |
| **Interruptor de despliegue** | regresión accidental al desplegar | DCA: cambio `package.json` separa `npm start` prod de `npm run dev` con migraciones; validar antes de próximo commit a `docs/`. Corregido y documentado en v0.1.0-iter001 (HEAD). 
## 7. Bloqueadores

- Ninguno. El despliegue está **documentado pero no ejecutado**: se hará cuando exista código
funcionando y el usuario lo apruebe (procedimiento en `docs/DEPLOYMENT.md`).

## 8. Archivos clave de la última sesión

- `AGENT.md`, `ARCHITECTURE.md`, `CHECKPOINT.md`, `README.md`, `AGENTS.md`
- `docs/{CONTEXT,PROJECT_STATE,QA_RESULTS,SESSION}.md`, `docs/Context_live.template.md`
- `scripts/check-docs-consistency.js`, `scripts/gen-context-live.sh`

## 9. Decisiones cerradas (Fase 0)

Personal multi-tenant-ready · Node 22 + `node:sqlite` + MVC vanilla sin build · web en línea sin PWA ·
MVP con cuentas/categorías/transacciones/transferencias/presupuestos/recurrentes · publicación mediante
el servicio del sistema y el proxy del equipo, **sin alterar la entrada pública existente**
(procedimiento en `AGENT.md` §10 y `docs/DEPLOYMENT.md`) · dueño único con PBKDF2 y cookie de sesión ·
**GTQ base + USD**
con cotización **congelada al registrar** · `open.er-api.com` primaria y Banguat secundaria ·
`docs/Context_live.md` fuera de git.

---

## Reglas de este archivo

1. **Se escribe a mano** (agente o humano); nunca se genera automáticamente.
2. **No afirma** estado de servicios, puertos, URLs, salud del despliegue ni tamaño de base de datos:
eso vive en `docs/Context_live.md` (dueño único).
3. **No copia** datos de infraestructura: los **referencia** (`→ ver docs/Context_live.md`).
4. **Precedencia**: ante discrepancia sobre runtime/infra gana `docs/Context_live.md` (dato medido);
sobre el proyecto gana este archivo. La discrepancia se **reporta**, no se arregla en silencio.
5. **Se actualiza** al cerrar cada iteración, al 80 % de contexto o cuando el usuario diga "checkpoint".
6. **Retención**: este archivo siempre refleja el último estado; el historial va en
`context-checkpoints/` (últimos 50, FIFO).
