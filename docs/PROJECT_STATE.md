# PROJECT_STATE.md — Gastos

**Iteración actual:** ITER-001 (en curso) · **Fase:** 1 Plan/Implementación · **Código:** Fase A+B verificadas en vivo; falta suite + UI
**Última actualización:** 2026-09-20 17:00 (checkpoint manual)

---

## 1. Iteración actual

| Campo | Valor |
|---|---|
| Objetivo | Implementar fundaciones + SPEC-001 con sus 15 AC en tests y UI mínima de login |
| Estado | 🔄 en curso (Fase A y B verificadas en vivo; falta suite + UI) |
| Spec activa | `docs/specs/SPEC-001-autenticacion.md` (aprobada, en implementación) |
| Despliegue | pendiente (documentado, no ejecutado) |

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

### 🔄 En curso (ITER-001)

- [x] **Aprobar** `SPEC-001-autenticacion.md` (aprobada 2026-09-20).
- [x] Fase A: config, utilidades, `sqlite.js`, migraciones, router, app, bootstrap (verificado en vivo).
- [x] Fase B: `PasswordService`, repositorios, `AuthService`, middleware, rutas auth/health (verificado en vivo).
- [x] Corrección real de `cookiePath` (dev `/`, prod `/gastos`).
- [ ] Suite de tests de 15 AC (`tests/run-all.js` + 8 archivos).
- [ ] Fase C: UI mínima de login + test de rutas relativas.

### ⏳ Pendientes (bloqueadas por la orden de "implementar")

- [ ] Migraciones + `sqlite.js` + bootstrap (SPEC-001/010).
- [ ] Autenticación y sesión (SPEC-001).
- [ ] Cuentas, categorías, transacciones, transferencias (SPEC-002..005).
- [ ] Presupuestos y recurrentes (SPEC-006..007).
- [ ] Tipos de cambio (SPEC-008).
- [ ] Reportes (SPEC-009).
- [ ] Despliegue y publicación en línea (SPEC-010).

## 3. Métricas

| Métrica | Valor actual | Objetivo |
|---|---|---|
| Cobertura de criterios de aceptación con test | n/a (sin código) | 100 % |
| Tests unitarios + integración | 0 | ≥ 1 por AC |
| Tests E2E | 0 | flujos críticos cubiertos |
| `npm run check:docs` | **pass** (0 contradicciones, 0 avisos) | siempre pass |
| Defectos abiertos P0/P1 | 0 | 0 |

## 4. Deuda técnica

| Deuda | Origen | Cuándo se paga |
|---|---|---|
| `migrate` / `user:create` / `rates:refresh` son stubs que fallan a propósito | Fase 0 sin código | con la implementación de sus specs |
| E2E sin implementar (Playwright como devDependency, sin `npm install`) | Fase 0 | al implementar el primer flujo completo |
| Sin bloqueo de meses cerrados | decisión de alcance | fase 2 |

## 5. Riesgos

Los riesgos de trabajo están en `CHECKPOINT.md` §6; los de infraestructura, en `docs/Context_live.md`.
Riesgo específico de esta iteración: que las decisiones de Fase 0 se diluyan si se empieza a codificar
sin spec (mitigado con el gate `SPEC_READY` de `AGENT.md` §14).

## 6. Próximos pasos

1. Aprobar `SPEC-001-autenticacion.md`.
2. Recibir la orden explícita de "implementar".
3. Red → Green → Refactor del módulo de autenticación con sus tests.
4. Cerrar la iteración actualizando `CHECKPOINT.md`, este archivo y `QA_RESULTS.md`.

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
| 2026-09-20 | Cierre de la documentación de arranque: repo git + tag `v0.0.1-fase0`, `check:docs` validado y `context:live` generado. |
