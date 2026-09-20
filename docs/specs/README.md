# Specs — índice

**Regla:** ninguna línea de código sin una spec aprobada (`AGENT.md` §14, gate `SPEC_READY`).
Cada spec es un **contrato ejecutable**: sus criterios de aceptación se convierten en tests 1:1.

| Spec | Título | Estado | Depende de |
|---|---|---|---|
| [SPEC-000](./SPEC-000-plantilla.md) | Plantilla obligatoria | — | — |
| [SPEC-001](./SPEC-001-autenticacion.md) | Autenticación y sesión del dueño | 🔨 **implementada** (ITER-001) — suite 21/21, UI mínima de login, verifier DCA del interruptor de despliegue | — |
| SPEC-002 | Cuentas (efectivo/débito/crédito) | ⏳ pendiente | SPEC-001 ✅ |
| SPEC-003 | Categorías (gasto/ingreso) | ⏳ pendiente | SPEC-001 |
| SPEC-004 | Transacciones (gastos e ingresos) | ⏳ pendiente | SPEC-002, SPEC-003, SPEC-008 |
| SPEC-005 | Transferencias entre cuentas | ⏳ pendiente | SPEC-004 |
| SPEC-006 | Presupuestos mensuales por categoría | ⏳ pendiente | SPEC-003, SPEC-004 |
| SPEC-007 | Gastos y ingresos recurrentes | ⏳ pendiente | SPEC-004 |
| SPEC-008 | Tipos de cambio GTQ ⇄ USD | ⏳ pendiente | — |
| SPEC-009 | Reportes del mes | ⏳ pendiente | SPEC-004, SPEC-005, SPEC-006 |
| SPEC-010 | Despliegue y publicación en línea | ⏳ pendiente | todas |

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
3. **SPEC-002 + SPEC-003** (cuentas y categorías) — catálogos base.
4. **SPEC-004** (transacciones) — el núcleo; luego SPEC-005 (transferencias).
5. **SPEC-006 + SPEC-007** (presupuestos y recurrentes).
6. **SPEC-009** (reportes) y **SPEC-010** (despliegue).
