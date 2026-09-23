# Specs — índice

**Regla:** ninguna línea de código sin una spec aprobada (`AGENT.md` §14, gate `SPEC_READY`).
Cada spec es un **contrato ejecutable**: sus criterios de aceptación se convierten en tests 1:1.

| Spec | Título | Estado | Depende de |
|---|---|---|---|
| [SPEC-000](./SPEC-000-plantilla.md) | Plantilla obligatoria | — | — |
| [SPEC-001](./SPEC-001-autenticacion.md) | Autenticación y sesión del dueño | 🔨 **implementada** (ITER-001) — suite 21/21, UI mínima de login, verifier DCA del interruptor de despliegue | — |
| [SPEC-002](./SPEC-002-cuentas.md) | Cuentas (efectivo/débito/crédito) | ✅ **aprobada** (2026-09-21) — tipos de cuenta, moneda, saldo inicial, archivado lógico, unicidad por nombre. Desbloquea: SPEC-004. | — |
| [SPEC-003](./SPEC-003-categorias.md) | Categorías (gasto/ingreso) | ✅ **aprobada** (2026-09-21) — categorías con tipo gasto/ingreso, jerarquía 1 nivel, color/icono, archivado. Desbloquea: SPEC-004, SPEC-006. | — |
| [SPEC-004](./SPEC-004-transacciones.md) | Transacciones (gastos e ingresos) | ✅ **aprobada** (2026-09-21) — CRUD expense/income, conversión multimoneda con freeze, archivado lógico, refund, filtros y paginación. Desbloquea: SPEC-005, SPEC-006, SPEC-007, SPEC-009. | SPEC-002, SPEC-003, SPEC-008 |
| [SPEC-005](./SPEC-005-transferencias.md) | Transferencias entre cuentas | 🔨 **implementada** (ITER-005) — 15/15 AC en verde; dos patas con `transferGroupId`, misma moneda base, sin influir en gastos/ingresos, borrado físico en una transacción. Depende de: SPEC-004. | SPEC-004 |
| [SPEC-006](./SPEC-006-presupuestos.md) | Presupuestos mensuales por categoría | ✅ **aprobada** (2026-09-21) — límite mensual en GTQ por categoría `expense`, consumido y porcentaje, alerta de exceso, auditoría. Depende de: SPEC-003, SPEC-004. Desbloquea: SPEC-009. | SPEC-003, SPEC-004 |
| [SPEC-007](./SPEC-007-recurrentes.md) | Gastos e ingresos recurrentes | ✅ **aprobada** (2026-09-21) — reglas con frecuencia monthly/weekly/biweekly/yearly, generación idempotente (I-06), tasa congelada, salto de períodos. Depende de: SPEC-002, SPEC-003, SPEC-004, SPEC-008. Desbloquea: SPEC-009. | SPEC-002, SPEC-003, SPEC-004, SPEC-008 |
| [SPEC-008](./SPEC-008-tipo-cambio-gtq-usd.md) | Tipos de cambio GTQ ⇄ USD | ✅ **aprobada** (2026-09-21) — cadena de resolución (primario→secundario→carry-forward→rechazo), freeze, override manual, refresco al arranque+manual. Desbloquea: SPEC-004. | — |
| [SPEC-009](./SPEC-009-reportes.md) | Reportes del mes | ✅ **aprobada** (2026-09-21) — resumen, balance, comparación con mes anterior, presupuesto vs real. Depende de: SPEC-004, SPEC-005, SPEC-006. Desbloquea: SPEC-010. | SPEC-004, SPEC-005, SPEC-006 |
| [SPEC-010](./SPEC-010-despliegue.md) | Despliegue y publicación en línea | ✅ **aprobada** (2026-09-21) — cadena de publicación, systemd, DCA interruptor, backup, rollback, 7 pasos verificación. Depende de: todas. | Todas |

## Estados posibles

`📝 propuesta` → `✅ aprobada` → `🔨 implementada` → `♻️ revisada` (nueva versión).

## Checklist de revisión (obligatorio antes de aprobar)

```
[ ] Problema entendido sin contexto adicional
[ ] Objetivo binario falsable
[ ] Contexto acotado (usuario real + escenario + límites)
[ ] Alcance con "Incluye" y "No incluye" (ninguno vacío)
[ ] Comportamiento: principal + alternativos + casos límite
[ ] Criterios de aceptación en Given/When/Then, binarios
[ ] Al menos un ejemplo ejecutable por flujo crítico
[ ] Restricciones técnicas, de negocio y de seguridad
[ ] Trazabilidad: AC → test → código
[ ] Firmado por el dueño del producto y el responsable técnico
```

## Orden de implementación sugerido

1. **SPEC-001** (autenticación) — **ITER-001**: es la puerta de entrada; todas las rutas de negocio
   pasan por `requireAuth`, así que sin ella no se puede probar nada más.
2. **SPEC-008** (tipos de cambio) — **ITER-002**: no depende de nada y desbloquea las transacciones.
   Primero que nada, luego de ITER-001.
3. **SPEC-002 + SPEC-003** (cuentas y categorías) — catálogos base.
4. **SPEC-004** (transacciones) — el núcleo; luego SPEC-005 (transferencias).
5. **SPEC-006 + SPEC-007** (presupuestos y recurrentes).
6. **SPEC-009** (reportes) y **SPEC-010** (despliegue).
