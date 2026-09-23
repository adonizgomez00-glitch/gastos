# QA_RESULTS.md — Gastos

**Iteraciones evaluadas:** ITER-001 ✅ · ITER-004 ✅ (SPEC-002/003/004/008) · ITER-005 ✅ (SPEC-005)
**Última actualización:** 2026-09-22

---

## 1. Resumen ejecutivo

| Iteración | Fase | Tests ejecutados | Defectos | Estado |
|---|---|---|---|---|
| ITER-001 (completo) | SPEC-001 A+B+C + UI mínima de login | 21 (20 unit/integración + 1 cliente) | 1 detectado y corregido (DEF-001) | 21/21 en verde, UI verificada en vivo, DCA del interruptor de despliegue |
| ITER-004 (completo) | SPEC-002 + SPEC-003 + SPEC-004 + SPEC-008 | 75 unit+integración | 2 detectados y corregidos (DEF-002, DEF-003) | **75/75 en verde**, `check:docs` 0 avisos |
| ITER-005 (completo) | SPEC-005 transferencias | 15 unit+integración | 0 de implementación; 1 typo de spec corregido (AC-02) | **90/90 en verde**, `check:docs` 0 avisos |

## 2. Métricas agregadas

| Métrica | Valor | Objetivo |
|---|---|---|
| Tests unitarios + integración | **90** (84 AC cubiertos) | ≥ 1 por criterio de aceptación |
| Tests E2E | 0 | flujos críticos |
| Defectos P0/P1 abiertos | 0 | 0 |
| Cobertura de AC | **100 %** de SPEC-001/002/003/004/005/008 | 100 % |
| `npm run check:docs` | pass (0 avisos) | pass en cada cierre |

## 3. Defectos por fase

| Fase | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Plan | 0 | 0 | 0 | 0 |
| Arquitectura | 0 | 0 | 0 | 0 |
| Implementación | 0 | 2 (cerrados) | 0 | 0 |
| QA | 0 | 0 | 0 | 0 |

## 4. Defectos por categoría

| Categoría | Ocurrencias | Nota |
|---|---|---|
| Exactitud financiera | 0 | se vigila con las pruebas obligatorias de `AGENT.md` §11.3 |
| Aislamiento de espacios | 0 | test de no-fuga obligatorio (I-07) |
| Seguridad | 0 | modelo de amenazas en `ARCHITECTURE.md` §8 |
| Documentación inconsistente | 1 | typo AC-02 de SPEC-005 (corregido en la spec) |
| Lógica de negocio (campo/consulta) | 2 | DEF-002, DEF-003 (cerrados en ITER-004) |

## 5. Tendencias recurrentes

Sin datos. Los patrones se documentarán cuando existan al menos una iteración con defectos.

## 6. Hallazgos corregidos

*(Formato: DEF-XXX — Fase — Causa — Fix — Prevención — Skill/regla actualizada)*

| ID | Fase | Causa | Fix | Prevención |
|---|---|---|---|---|
| DEF-001 | ITER-001 (suite) | El test de AC-07 pasaba a medias: el token vencido devolvía 401 pero **no se eliminaba** de la tabla `sessions` | `resolveSession` ahora elimina de inmediato la sesión vencida encontrada (`findAny` + `deleteByToken`) | los tokens muertos no se acumulan: AC-07 verifica el borrado real en la BD |
| DEF-002 | ITER-004 (SPEC-004) | `TransactionService.create` evaluaba `account.active` (campo inexistente; el repo expone `archived`) → **toda** creación fallaba con `ACCOUNT_ARCHIVED` | condición corregida a `if (account.archived)` | test AC-08 + AC-01: creación en cuenta activa debe pasar y en archivada rechazar 422 |
| DEF-003 | ITER-004 (SPEC-004) | `GET /api/transactions` desestructuraba `URLSearchParams` como objeto literal → filtros `from/to/kind/...` siempre `undefined` y la lista devolvía el mes completo sin filtrar | rutas leen `ctx.query.get('from')` etc. (patrón de `accounts.js`/`categories.js`) | tests AC-17/AC-19: filtros y cuadre de totales fallaban al depender de filtros rotos |
| DEF-004 | ITER-005 (SPEC-005) | **Typo en la spec, no en el código:** AC-02 de SPEC-005 escribía `amountBaseCents=385153`, pero la fórmula §5.1 (half-up de `5000 × 7.703054`) y el ejemplo §5.3 ("$50 → Q385.15") dan **38515** | spec corregida a 38515 (AC-02, §7, §9); el test `transferUsdToGtqConverts` siempre verificó la matemática correcta | los ejemplos numéricos de las specs se contrastan con la fórmula antes de aprobar |

## 7. Hallazgos detectados **antes** de codificar (Fase 0)

| # | Hallazgo | Evidencia | Acción tomada |
|---|---|---|---|
| H-01 | El watchdog de Química borra las rutas del Funnel al reiniciarlo | `watchdog.sh` → `restart_funnel()` con `funnel --https=443 off` + `--bg 8000` | publicar como `location` de nginx (ADR-005) |
| H-02 | El generador de `~/Config-System/Context_live.md` pisa las notas manuales | `gen-context-live.sh` líneas 217-223 (texto hardcodeado) | marcadores de bloque en el generador propio |
| H-03 | `api.frankfurter.app` no publica GTQ y `api.exchangerate.host` exige key | 404 y `missing_access_key` | proveedores primario/secundario definidos (ADR-004) |
| H-04 | `sudo` pide contraseña en la máquina | `sudo -n true` falla | usar `pkexec` en el despliegue |
| H-05 | Disco `/home` al 86 % (2026-09-20) | `df -h /home` | registrado como riesgo de infraestructura |

## 8. Criterios de cierre de una iteración (gate)

1. Cierre de ITER-001: Fase A+B+C, suite 21/21, UI verificada en vivo, DCA del interruptor de despliegue. Arregló **DEF-001** (token vencido eliminado) y **DCA del interruptor** (documentado; cambio `package.json` listo para próximo commit).
2. Flujo de login E2E: sin Playwright todavía (E2E no instalado). Verificado: inicio de sesión con credenciales válidas (browser 127.0.0.0.1:8100 frontend), logout, no-login redirige a /login.

2. Pruebas financieras obligatorias (`AGENT.md` §11.3) en verde.
3. `npm run check:docs` en verde.
4. `CHECKPOINT.md`, `docs/PROJECT_STATE.md` y este archivo actualizados.
5. Cero defectos P0/P1 abiertos.

## 9. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-22 | ITER-005 completado: SPEC-005 implementada + 15 tests; suite 90/90; DEF-004 (discrepancia AC-02 de spec) reportado. |
| 2026-09-20 19:15 | ITER-002 (revisión de specs, sin código): SPEC-008 ✅ carry-forward aclarado como estrategia (no `source`); 2/2 ❓ cerradas. SPEC-002 4/4 ❓ cerradas. No ejecuta tests ni código (regla de oro). |
| 2026-09-20 | Creación del documento + registro de 5 hallazgos detectados antes de codificar. |
| 2026-09-20 | ITER-001 completado: Fase A+B+C, suite 21/21, UI mínima de login verificada en vivo, DCA del interruptor de despliegue documentado, DEF-001 corregido. |
