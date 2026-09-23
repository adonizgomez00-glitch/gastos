# PROJECT_STATE.md — Gastos

**Iteración actual:** ITER-005 (completada) · **Fase:** implementación (red → green → refactor)
**Última actualización:** 2026-09-22 (cierre ITER-005 — suite 90/90)

---

## 1. Iteración actual

| Campo | Valor |
|---|---|
| Objetivo | ITER-005: implementar y testear SPEC-005 transferencias |
| Estado | ✅ **completada** — suite **90/90 en verde**, `check:docs` 0 avisos |
| Spec activa | SPEC-001 ✅ · SPEC-002 ✅ · SPEC-003 ✅ · SPEC-004 ✅ · **SPEC-005 ✅ (15/15)** · SPEC-008 ✅ · SPEC-006/007 ← próxima |
| Despliegue | pendiente (documentado, no ejecutado; SPEC-010) |

## 2. Tareas

### ✅ Completadas

- [x] Relevamiento del entorno (Node, SQLite, Docker, nginx, Tailscale, puertos, cron).
- [x] Verificación de la metodología SAQI aplicable (skills Nivel A).
- [x] Nueve decisiones de Fase 0 cerradas con el usuario.
- [x] `AGENT.md` (16 secciones), `AGENTS.md`, `ARCHITECTURE.md` (ADR-001..006), `CHECKPOINT.md`.
- [x] Documentos vivos: `CONTEXT.md`, `PROJECT_STATE.md`, `QA_RESULTS.md`, `SESSION.md`.
- [x] Contrato anti-contradicción + verificador `npm run check:docs`.
- [x] `docs/specs/` con plantilla, índice y **SPEC-001** redactada (15 criterios de aceptación).
- [x] Verificador `npm run check:docs` implementado y **validado con pruebas negativas** (falla al detectar contradicción).
- [x] `npm run context:live` implementado y ejecutado: genera el estado vivo real de infraestructura.
- [x] Repositorio git inicializado; etiqueta `v0.0.1-fase0`.
- [x] ITER-001 cerrado: SPEC-001 aprobada + implementada; suite 21/21; Fase A+B+C verificadas en vivo; DCA del interruptor de despliegue documentado; `cookiePath` corregido (DEF-001).
- [x] **ITER-004 cerrado:** SPEC-002 (10 AC) + SPEC-003 (10 AC) + SPEC-008 (15 AC) + **SPEC-004 (19 AC)** implementadas y testeadas; suite **75/75**; DEF-002 y DEF-003 corregidos; `Context_live` fresco.
- [x] **ITER-005 cerrado:** **SPEC-005 (15 AC)** implementada y testeada; suite **90/90**; typo AC-02 corregido en la spec; `check:docs` 0 avisos.

### 🔄 En curso

- (nada — esperando orden para la siguiente iteración)

### ⏳ Pendientes

- [ ] **SPEC-006 presupuestos + SPEC-007 recurrentes** ← prioridad
- [ ] SPEC-009 reportes
- [ ] SPEC-010 despliegue y publicación en línea
- [ ] E2E con Playwright (`npm run test:e2e`)
- [ ] Commitear el trabajo de ITER-004/005 (solo con orden explícita)

## 3. Métricas

| Métrica | Valor actual | Objetivo |
|---|---|---|
| Cobertura de criterios de aceptación con test | **100 %** de SPEC-001/002/003/004/005/008 (84 AC) | 100 % |
| Tests unitarios + integración | **90** | ≥ 1 por AC |
| Tests E2E | 0 | flujos críticos cubiertos |
| `npm run check:docs` | **pass** (0 contradicciones, 0 avisos) | siempre pass |
| Defectos abiertos P0/P1 | 0 | 0 |

## 4. Deuda técnica

| Deuda | Origen | Cuándo se paga |
|---|---|---|
| E2E sin implementar (Playwright como devDependency, sin `npm install`) | Fase 0 | al implementar el primer flujo completo |
| Sin bloqueo de meses cerrados | decisión de alcance | fase 2 |
| Trabajo ITER-004/005 sin commitear | regla "no commit sin orden" | cuando el dueño lo autorice |

## 5. Riesgos

Los riesgos de trabajo están en `CHECKPOINT.md` §6; los de infraestructura, en `docs/Context_live.md`.

## 6. Próximos pasos

1. **SPEC-006 + SPEC-007** presupuestos y recurrentes.
2. Luego SPEC-009 reportes → SPEC-010 (despliegue).
3. Commitear ITER-004/005 cuando el dueño lo autorice.

## 7. Archivos clave

| Archivo | Rol |
|---|---|
| `AGENT.md` | contrato operativo |
| `ARCHITECTURE.md` | arquitectura y ADRs |
| `CHECKPOINT.md` | estado del proyecto |
| `docs/Context_live.md` | estado de infraestructura (local, fuera de git) |
| `scripts/check-docs-consistency.js` | verificador de consistencia documental |
| `scripts/gen-context-live.sh` | regenera el estado vivo |
| `docs/specs/SPEC-000-plantilla.md` | plantilla obligatoria de specs |

## 8. Estructura vigente

```
gastos/
├── AGENT.md · AGENTS.md · ARCHITECTURE.md · CHECKPOINT.md · README.md
├── context-checkpoints/ (ITER-000 en adelante)
├── docs/ (vivos + técnicos + specs/)
├── scripts/ (check-docs-consistency.js · gen-context-live.sh · backup-db.sh · stubs)
├── server/ · src/ · assets/ · tests/   ← vacíos hasta la implementación
└── data/ · backups/                    ← ignorados en git
```

## 9. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación: iteración ITER-000, tareas, métricas, deuda y próximos pasos. |
| 2026-09-20 17:00 | Checkpoint manual ITER-001: Fase A+B en vivo, `cookiePath` corregido, suite y UI pendientes. |
| 2026-09-20 | Paso 2 completado: suite de 15 AC en verde (21/21) + test de rutas relativas registrado. |
| 2026-09-20 | Cierre de ITER-001: SPEC-001 → implementada, Fase C realizada (UI mínima de login), suite 21/21, DCA del interruptor de despliegue documentado. |
| 2026-09-20 | Cierre de la documentación de arranque: repo git + tag `v0.0.1-fase0`, `check:docs` validado y `context:live` generado. |
| 2026-09-20 | Cierre de ITER-001: SPEC-001 → implementada, Fase C realizada (UI mínima de login), suite 21/21, DCA del interruptor de despliegue documentado, DEF-001 (cookiePath) corregido. |
| 2026-09-20 19:15 | ITER-002: revisión de decisiones abiertas. SPEC-008 ✅ carry-forward como estrategia (alineado a `AGENT.md` §6.1 + ADR-004); SPEC-002 4/4 ❓ cerradas. Checkpoint `ITER-002-20260920-1915.md`.
