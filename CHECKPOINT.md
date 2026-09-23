# CHECKPOINT — App de Gastos Personales

> **Último checkpoint de contexto**: 2026-09-22 · **ITER-005 (completada)** · Fase B (implementación)
> **Uso de contexto al cerrar**: —
> **Estado de infraestructura**: ver `docs/Context_live.md` (local, **fuera de git**)

---

## 1. Fase y estado del proyecto

| Campo | Valor |
|---|---|
| Fase | 2 — **ITER-005 completada** — SPEC-002 + SPEC-003 + SPEC-008 + SPEC-004 + SPEC-005 |
| Iteración | ITER-001 ✅ · ITER-002 ✅ · ITER-003 ✅ · ITER-004 ✅ · **ITER-005 ✅** |
| Código | SPEC-001 .. SPEC-005 + SPEC-008 implementadas y **testeadas** (suite **90/90 en verde**, medida 2026-09-22) |
| Spec activa | SPEC-001 ✅ · SPEC-002 ✅ · SPEC-003 ✅ · SPEC-004 ✅ · SPEC-005 ✅ · SPEC-008 ✅ · **SPEC-006/007: pendientes** ← prioridad próxima sesión |
| Repo | git init + commits + etiqueta v0.1.0-iter001 + **cambios de ITER-004/005 sin commitear** |
| Despliegue | Documentado (SPEC-010); no ejecutado; pendiente de código implementado |

## 2. Módulos y entregables

| # | Módulo | Spec | Estado |
|---|---|---|---|
| 0 | Documentación de arranque | — | ✅ completada |
| 1 | Autenticación + creación de space | SPEC-001 | ✅ implementada (suite 21/21) |
| 2 | Cuentas (efectivo/débito/crédito) | SPEC-002 | ✅ implementada (10/10 AC) |
| 3 | Categorías (gasto/ingreso) | SPEC-003 | ✅ implementada (10/10 AC) |
| 4 | Tipos de cambio GTQ⇄USD | SPEC-008 | ✅ implementada (15/15 AC) |
| 5 | Transacciones (núcleo) | SPEC-004 | ✅ **implementada (19/19 AC)** |
| 6 | Transferencias | SPEC-005 | ✅ **implementada (15/15 AC)** |
| 7 | Presupuestos | SPEC-006 | ⬜ pendiente ← prioridad |
| 7 | Recurrentes | SPEC-007 | ⬜ pendiente |
| 9 | Reportes | SPEC-009 | ⬜ pendiente |
| 10 | Despliegue | SPEC-010 | ⬜ pendiente |

## 3. Tests

| Suite | Resultado | Comando |
|---|---|---|
| Unit + integración | **90 en verde, 0 en rojo** (~5.0 s) | `npm test` |
| E2E (Playwright) | no implementado | `npm run test:e2e` |
| Consistencia de documentos | **coherente, exit 0, 0 avisos** | `npm run check:docs` |

**Cobertura de ACs:** SPEC-001 15/15 · SPEC-002 10/10 · SPEC-003 10/10 · SPEC-004 19/19 · SPEC-005 15/15 · SPEC-008 15/15 = **84/84 ACs de los módulos cerrados en verde.**

## 4. Última actividad completada (ITER-005)

- **Código de SPEC-005** (transferencias): `TransactionService.createTransfer`/`listTransfers`/`deleteTransfer`, `TransactionRepository.findByTransferGroup`/`listTransfers`/`deleteByTransferGroup`, rutas `POST/GET/DELETE /api/transfers`.
- **15 tests de SPEC-005** en `tests/integration/transfers.test.js` (un export por AC, patrón de `transactions.test.js`).
- **Spec corregida:** AC-02 de SPEC-005 escribía `amountBaseCents=385153`; la fórmula §5.1 y el ejemplo §5.3 dan **38515**. Spec actualizada (AC-02, §7, §9) a petición del dueño; el test siempre verificó la matemática correcta.
- **Context_live regenerado** (`npm run context:live`); `npm run check:docs` → exit 0, 0 avisos.

## 5. Próximo paso (uno, verificable) — PRIORIDAD PRÓXIMA SESIÓN

- **SPEC-006 (presupuestos)** y **SPEC-007 (recurrentes):** red → green → refactor.
- Criterio de cierre: `npm test` → suite completa en verde y `npm run check:docs` exit 0.
- Si un AC falla → defecto de implementación; reportar al dueño, **no relajar el test**.

> **Regla de oro respetada:** la suite usa dobles de red para tasas; `npm test` no efectúa llamadas HTTP reales.
> **Commits:** mucho trabajo de ITER-004 sigue **sin commitear**; no commitear sin orden explícita.

## 6. Riesgos de trabajo

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `node:sqlite` experimental (Node 22.23.1) | cambio de API | acceso aislado en `sqlite.js` + migraciones idempotentas |
| Aritmética de conversión con `round-half-up` | posible drift de centavos | `toBaseCents` + AC-15 verifica el cuadro exacto |
| `open.er-api.com` gratuito puede caer | tasa indisponible | carry-forward + override manual + Banguat secundario |
| Saldo calculado en tiempo real | carga con muchas transacciones | índice `transactions(space_id, occurred_on)`; se optimiza en fase 2 |

## 7. Bloqueadores

- Ninguno. La suite está **en verde completo (90/90)**. La prioridad abierta son las **specs SPEC-006 y SPEC-007** (aprobadas, sin código). El despliegue sigue documentado pero no ejecutado (SPEC-010).
- **Typo de spec corregido:** AC-02 de SPEC-005 (`amountBaseCents=385153` → `38515`, coherente con §5.1/§5.3).
- **Commits pendientes:** ITER-004 y ITER-005 siguen **sin commitear**; no commitear sin orden explícita.

## 8. Archivos clave de la última sesión (ITER-005)

Nuevos: `server/utils/{money,fx}.js`, `server/repositories/{Account,Category,ExchangeRate,Audit,Space,Transaction}Repository.js`, `server/services/{Account,Category,Rate,Transaction}Service.js`, `server/services/rates/{ErApi,Banguat}Provider.js`, `server/routes/{accounts,categories,rates,transactions}.js`, migraciones `002..005`, tests `accounts/categories/rates.test.js`.
Modificados: `server/{app,bootstrap,middleware/auth,routes/health}.js`, `server/services/AuthService.js`, `package.json`, `scripts/gen-context-live.sh`, `docs/Context_live.md`.
  - SPEC-008: aclarado **carry-forward como estrategia de resolución, no como `source` grabado**
    (alineado a `AGENT.md` §6.1 `CHECK IN ('er-api','banguat','manual')` y ADR-004);
    cerradas las 2 ❓ de la spec (override con fecha de vigencia explícita; refresco al arranque+manual, sin cron).
  - SPEC-002: cerradas las 4 ❓ (schema a `archived`/`opening_balance_cents`; sin límite de cuentas;
    GTQ/USD; saldo inicial vs transitorio).
  - Checkpoint de continuidad: `context-checkpoints/ITER-002-20260920-1915.md`.
- **Iteración ITER-003 (2026-09-21)**: creación y aprobación de todas las specs.
  - Especificación completa del módulo de transacciones (SPEC-004): 19 ACs, 5 endpoints, archivado lógico, refund, conversión multimoneda con freeze.
  - Especificación completa del módulo de transferencias (SPEC-005): 15 ACs, dos patas con `transferGroupId`, misma moneda base, borrado físico.
  - Especificación completa del módulo de presupuestos (SPEC-006): 13 ACs, UNIQUE(space_id, category_id, year, month), consumido vs presupuesto.
  - Especificación completa del módulo de recurrentes (SPEC-007): 16 ACs, idempotencia (I-06), tasa congelada, salto de período si cuenta archivada o sin tasa.
  - Especificación completa del módulo de reportes (SPEC-009): 16 ACs, resumen, por categoría, por cuenta, comparación mes a mes, regla de cuadre.
  - Especificación completa del módulo de despliegue (SPEC-010): 15 ACs, 7 pasos de verificación, DCA del interruptor, backup/restore, rollback.
  - **Todas las 10 specs aprobadas** y listas para la fase de implementación (red → green → refactor).

## 5.bis Próximo paso (bloque de specs histórico)

- Orden de implementación de specs:
  1. ~~SPEC-001~~ ✅ implementada + tests
  2. ~~SPEC-008~~ ✅ implementada + tests
  3. ~~SPEC-002 + SPEC-003~~ ✅ implementadas + tests
  4. ~~SPEC-004~~ ✅ implementada + tests
  5. ~~SPEC-005~~ ✅ implementada + tests
  6. **SPEC-006 + SPEC-007** — ⬜ pendientes ← PRIORIDAD
  7. SPEC-009 (aprobada, sin código)
  8. SPEC-010 (aprobada, despliegue pendiente)

> **Regla de oro respetada:** toda la sesión fue sobre specs (`.md`) y docs vivos; **ningún archivo de implementación, dependencia o comando de build** se ejecutó.

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
| **Interruptor de despliegue** | regresión accidental al desplegar | DCA: cambio `package.json` separa `npm start` prod de `npm run dev` con migraciones; validar antes de próximo commit a `docs/`. Corregido y documentado en v0.1.0-iter001 (HEAD). |
| **Todas las specs aprobadas sin código** | especificación completa pero sin implementación | la fase de implementación (red → green → refactor) comenzará en la próxima sesión |

## 7. Bloqueadores

- Ninguno. El despliegue está **documentado pero no ejecutado**: se hará cuando exista código
funcionando y el usuario lo apruebe (procedimiento en `docs/DEPLOYMENT.md`).

## 8. Archivos clave de la última sesión

- `docs/specs/SPEC-004-transacciones.md` (creado)
- `docs/specs/SPEC-005-transferencias.md` (creado)
- `docs/specs/SPEC-006-presupuestos.md` (creado)
- `docs/specs/SPEC-007-recurrentes.md` (creado)
- `docs/specs/SPEC-009-reportes.md` (creado)
- `docs/specs/SPEC-010-despliegue.md` (creado)
- `docs/specs/README.md` (actualizado — todas las specs aprobadas)
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
