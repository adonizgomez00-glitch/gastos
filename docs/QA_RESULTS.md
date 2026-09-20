# QA_RESULTS.md — Gastos

**Iteraciones evaluadas:** ninguna todavía (Fase 0 sin código)
**Última actualización:** 2026-09-20

---

## 1. Resumen ejecutivo

| Iteración | Fase | Tests ejecutados | Defectos | Estado |
|---|---|---|---|---|
| — | — | 0 | 0 | sin código: nada que probar |

> Este documento está **vacío de resultados a propósito**: se completa cuando exista la primera
> línea de código. Se crea ahora para que la estructura de QA no sea una improvisación posterior.

## 2. Métricas agregadas

| Métrica | Valor | Objetivo |
|---|---|---|
| Tests unitarios + integración | 0 | ≥ 1 por criterio de aceptación |
| Tests E2E | 0 | flujos críticos |
| Defectos P0/P1 abiertos | 0 | 0 |
| Cobertura de AC | n/a | 100 % |
| `npm run check:docs` | pass | pass en cada cierre |

## 3. Defectos por fase

| Fase | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Plan | 0 | 0 | 0 | 0 |
| Arquitectura | 0 | 0 | 0 | 0 |
| Implementación | — | — | — | — |
| QA | — | — | — | — |

## 4. Defectos por categoría

| Categoría | Ocurrencias | Nota |
|---|---|---|
| Exactitud financiera | 0 | se vigila con las pruebas obligatorias de `AGENT.md` §11.3 |
| Aislamiento de espacios | 0 | test de no-fuga obligatorio (I-07) |
| Seguridad | 0 | modelo de amenazas en `ARCHITECTURE.md` §8 |
| Documentación inconsistente | 0 | mitigado con `npm run check:docs` |

## 5. Tendencias recurrentes

Sin datos. Los patrones se documentarán cuando existan al menos una iteración con defectos.

## 6. Hallazgos corregidos

*(Formato: DEF-XXX — Fase — Causa — Fix — Prevención — Skill/regla actualizada)*

| ID | Fase | Causa | Fix | Prevención |
|---|---|---|---|---|
| — | — | — | — | — |

## 7. Hallazgos detectados **antes** de codificar (Fase 0)

| # | Hallazgo | Evidencia | Acción tomada |
|---|---|---|---|
| H-01 | El watchdog de Química borra las rutas del Funnel al reiniciarlo | `watchdog.sh` → `restart_funnel()` con `funnel --https=443 off` + `--bg 8000` | publicar como `location` de nginx (ADR-005) |
| H-02 | El generador de `~/Config-System/Context_live.md` pisa las notas manuales | `gen-context-live.sh` líneas 217-223 (texto hardcodeado) | marcadores de bloque en el generador propio |
| H-03 | `api.frankfurter.app` no publica GTQ y `api.exchangerate.host` exige key | 404 y `missing_access_key` | proveedores primario/secundario definidos (ADR-004) |
| H-04 | `sudo` pide contraseña en la máquina | `sudo -n true` falla | usar `pkexec` en el despliegue |
| H-05 | Disco `/home` al 86 % (2026-09-20) | `df -h /home` | registrado como riesgo de infraestructura |

## 8. Criterios de cierre de una iteración (gate)

1. 100 % de los criterios de aceptación de la spec activa con test en verde.
2. Pruebas financieras obligatorias (`AGENT.md` §11.3) en verde.
3. `npm run check:docs` en verde.
4. `CHECKPOINT.md`, `docs/PROJECT_STATE.md` y este archivo actualizados.
5. Cero defectos P0/P1 abiertos.

## 9. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación del documento + registro de 5 hallazgos detectados antes de codificar. |
