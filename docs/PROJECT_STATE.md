# PROJECT_STATE.md — Gastos

**Iteración actual:** ITER-000 · **Fase:** 0 completada (diseño y decisiones) · **Código:** no existe todavía
**Última actualización:** 2026-09-20

---

## 1. Iteración actual

| Campo | Valor |
|---|---|
| Objetivo | Cerrar el arranque documental y las decisiones de Fase 0 |
| Estado | ✅ completada (documentación) |
| Spec activa | `docs/specs/SPEC-001-autenticacion.md` (por aprobar) |
| Despliegue | pendiente (documentado, no ejecutado) |

## 2. Tareas

### ✅ Completadas

- [x] Relevamiento del entorno (Node, SQLite, Docker, nginx, Tailscale, puertos, cron).
- [x] Verificación de la metodología SAQI aplicable (skills Nivel A).
- [x] Nueve decisiones de Fase 0 cerradas con el usuario.
- [x] `AGENT.md` (16 secciones), `AGENTS.md`, `ARCHITECTURE.md` (ADR-001..006), `CHECKPOINT.md`.
- [x] Documentos vivos: `CONTEXT.md`, `PROJECT_STATE.md`, `QA_RESULTS.md`, `SESSION.md`.
- [x] Contrato anti-contradicción + verificador `npm run check:docs`.
- [x] `docs/specs/` con plantilla e índice.

### 🔄 En curso

- [ ] `SPEC-001-autenticacion.md` (redacción y aprobación).

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
| `npm run check:docs` | pass | siempre pass |
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
