---
spec_id: SPEC-006
titulo: Presupuestos mensuales por categoría
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-003, SPEC-004, SPEC-009, SPEC-010]
adrs: [ADR-003, ADR-006]
---

# SPEC-006 — Presupuestos mensuales por categoría

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

El dueño necesita controlar cuánto planea gastar por categoría en un mes, para no superar su presupuesto. Sin presupuestos, registra gastos sin límite y al final del mes descubre que gastó de más en algo. El presupuesto es un **límite planeado en moneda base** (GTQ) por categoría y mes, que se compara contra el consumido real (de las transacciones de esa categoría en ese período).

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño planea su gasto mensual por categoría (Comida, Transporte, etc.) y quiere saber en tiempo real si va por encima |
| Escenario | Al inicio del mes fija un presupuesto de Q500 para Comida; durante el mes registra gastos; quiere ver qué porcentaje ha consumido |
| Limitaciones | El presupuesto se expresa en moneda base (GTQ) siempre, incluso para categorías que recibirán gastos en USD. El dueño revisa el status desde el móvil |
| Riesgo principal | Que el presupuesto se defina en centavos con coma flotante, o que el consumido no cuadre al centavo con las transacciones reales |

## 3. Objetivo (falsable)

> El sistema permite definir, consultar y eliminar presupuestos mensuales por categoría en moneda base, e informa el porcentaje de consumido respecto al presupuesto, exacto al centavo.

**No se cumple si:**

- El presupuesto se permite en coma flotante (I-01).
- El consumido reportado no cuadra con la suma de `amount_base_cents` de las transacciones de esa categoría en ese mes.
- El sistema no detecta o no reporta el exceso de presupuesto.
- Se puede definir un presupuesto para una categoría de otro espacio (I-07).

## 4. Alcance

### 4.1 Incluye

- Definir un presupuesto mensual (`amount_base_cents` en GTQ) para una categoría `expense` de un espacio.
- Upsert por `(categoryId, year, month)` con `UNIQUE(space_id, category_id, period_year, period_month)`.
- Consulta de presupuestos del mes con consumido y porcentaje.
- Alerta de exceso (cuando el consumido > el presupuesto).
- Auditoría de creación, edición y borrado en `audit_log` (I-11).

### 4.2 No incluye

- Presupuestos para categorías de tipo `income` (se valida y rechaza).
- Presupuestos recursivos (padre + hijos comparten presupuesto); la jerarquía se simplifica: presupuesto por categoría individual.
- Alertas push, notificaciones o emails (fuera del MVP, AGENT.md §3.2).
- Presupuestos anuales o ajustes automáticos basados en histórico.

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — definir presupuesto

1. El dueño autenticado abre la sección de presupuestos.
2. Selecciona una categoría de gasto (`kind = 'expense'`), año y mes, e ingresa el monto en GTQ (centavos).
3. El sistema valida:
   - La categoría existe, pertenece al espacio y su `kind` es `expense`.
   - El monto es un entero positivo en centavos (`amount_base_cents > 0`, I-01).
   - `period_month` está entre 1 y 12.
4. Si ya existe un presupuesto para `(categoryId, year, month)` en el espacio, se **actualiza** (upsert).
5. Se registra en `audit_log` (I-11).
6. La respuesta incluye el presupuesto y el consumido actual (suma de `amount_base_cents` de transacciones `expense` de esa categoría en ese mes, incluyendo gastos en USD convertidos).

### 5.2 Flujos alternativos

- **Categoría de ingreso** → rechazo con `422` / `BUDGET_CATEGORY_MUST_BE_EXPENSE`.
- **Categoría de otro espacio** → `404` (no filtra existencia, I-07).
- **Up-sell (upsert)** → si ya existe, se actualiza el monto; se audita con `before_json`/`after_json`.
- **Categoría archivada** → se permite el presupuesto (puede haber gastos históricos archivados que aún contabilizan).

### 5.3 Casos límite

- **Consumido incluye transacciones en USD** → el consumido suma `amount_base_cents` (moneda base) de todas las transacciones `expense` de la categoría, incluyendo gastos en USD convertidos al momento del registro (I-03, SPEC-008).
- **Transferencias excluidas** → las transacciones `kind = 'transfer'` nunca suman al consumido (I-04).
- **Transacciones con `occurred_on` en el mes** → se filtran por `period_year` y `period_month` de `occurred_on`, no por `created_at` (I-09).
- **Alerta de exceso** → se reporta cuando `consumido > presupuesto`; el porcentaje puede superar 100 %.
- **Mes futuro** → no hay transacciones todavía; consumido = 0, porcentaje = 0 %.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Definir presupuesto | el dueño tiene sesión válida, una categoría de gasto en su espacio | define un presupuesto de Q500.00 (50000 centavos) para Comida, mes 09/2026 | se crea con `amountBaseCents=50000`, `currency=GTQ`, `periodYear=2026`, `periodMonth=9` |
| AC-02 | Upsert sobre presupuesto existente | el dueño tiene un presupuesto de Q500 para Comida en 09/2026 | cambia el monto a Q600.00 | el presupuesto se actualiza a `60000`; se audita con `before/after_json` |
| AC-03 | Consumido con gastos en GTQ | el dueño tiene presupuesto Q500 y dos gastos de Q200 y Q100 en Comida en 09/2026 | consulta el presupuesto | `consumed=30000`, `percentage=60` |
| AC-04 | Consumido incluye gastos en USD | el dueño tiene presupuesto Q500 y un gasto en USD ($50 → Q385.15) en Comida | consulta el presupuesto | `consumed=38515`, `percentage=77` (usa `amount_base_cents` congelado, I-03) |
| AC-05 | Transferencias no suman al consumido | el dueño tiene una transferencia de Q100 en Comida (caso de datos) en 09/2026 | consulta el presupuesto | `consumed` no incluye la transferencia (I-04) |
| AC-06 | Alerta de exceso | el dueño tiene presupuesto Q500 para Comida | registra gastos que suman Q600 | el presupuesto reporta `percentage=120`, alerta de exceso activa |
| AC-07 | Rechazar presupuesto para categoría de ingreso | el dueño tiene una categoría de tipo `income` | intenta definir un presupuesto para esa categoría | rechazo con `422` / `BUDGET_CATEGORY_MUST_BE_EXPENSE` |
| AC-08 | Aislamiento por espacio | existe una categoría de gasto en el espacio B | el dueño intenta presupuestarla | rechazo con `404` (no filtra existencia, I-07) |
| AC-09 | Consumido respeta `occurred_on`, no `created_at` | el dueño tiene una transacción con `occurred_on=2026-09-15` y `created_at=2026-10-01` | consulta presupuesto de 09/2026 | la transacción sí suma al consumido (I-09) |
| AC-10 | Borrar presupuesto | el dueño tiene un presupuesto definido | borra el presupuesto | el presupuesto desaparece; los gastos siguen registrados; `audit_log` registra el borrado |
| AC-11 | Consulta con filtros de mes | el dueño tiene presupuestos en 08 y 09/2026 | consulta `/api/budgets?year=2026&month=9` | solo aparecen los de septiembre |
| AC-12 | Dinero en centavos | el dueño intenta definir un presupuesto con monto decimal (`500.50`) | envía `amountBaseCents` como string o float | rechazo con `422` / `INVALID_AMOUNT` (I-01) |
| AC-13 | Audit log de mutaciones | el dueño crea/edita/borra un presupuesto | se registra en `audit_log` | las tres acciones aparecen con `entity=budgets`, `action=create/update/delete`, `before_json`/`after_json` (I-11) |

## 7. Ejemplos ejecutables

```bash
# 1. Definir presupuesto (upsert)
curl -s -b /tmp/gastos.cookies -X PUT -H 'Content-Type: application/json' \
  -d '{"categoryId":"<id>","year":2026,"month":9,"amountBaseCents":50000}' \
  http://127.0.0.1:8100/api/budgets

# respuesta esperada:
# { "id":"…", "categoryId":"…", "periodYear":2026, "periodMonth":9,
#   "amountBaseCents":50000, "currency":"GTQ",
#   "spentCents":30000, "percentage":60, "overBudget":false }

# 2. Consultar presupuestos del mes
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/budgets?year=2026&month=9'

# 3. Borrar presupuesto
curl -s -b /tmp/gastos.cookies -X DELETE \
  http://127.0.0.1:8100/api/budgets/<id>
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Dinero en centavos (`INTEGER`); sin `REAL`; I-01 |
| Técnica | `UNIQUE(space_id, category_id, period_year, period_month)` (AGENT.md §6.1) |
| Técnica | `period_month CHECK (BETWEEN 1 AND 12)` |
| De negocio | Presupuesto solo para categorías `kind = 'expense'` |
| De negocio | Moneda base GTQ (`currency DEFAULT 'GTQ'`); el presupuesto se compara contra `amount_base_cents` de transacciones |
| De negocio | El consumido suma `amount_base_cents` de transacciones `kind IN ('expense','income')` — excluye transferencias (I-04) |
| De negocio | Filtro por `occurred_on`, no por `created_at` (I-09) |
| De negocio | Sin alertas ni notificaciones (AGENT.md §3.2) |
| De seguridad | Todo `space_id` filtrado desde la sesión (I-07) |
| De seguridad | Auditoría obligatoria en `audit_log` (I-11) |
| De seguridad | Sin exponer `password_hash`, `salt` u otros usuarios (I-10) |

## 9. Contratos

Los endpoints de presupuestos están definidos en `docs/API.md` §8:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/budgets?year=&month=` | incluye consumido y porcentaje |
| PUT | `/api/budgets` | upsert por `(categoryId, year, month)` |
| DELETE | `/api/budgets/:id` | — |

**Respuesta al crear/actualizar** (ejemplo):

```json
{
  "id": "…",
  "categoryId": "…",
  "periodYear": 2026,
  "periodMonth": 9,
  "amountBaseCents": 50000,
  "currency": "GTQ",
  "spentCents": 30000,
  "percentage": 60,
  "overBudget": false
}
```

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones

- ✅ **Presupuesto solo para `expense`**: las categorías de ingreso no reciben presupuesto; se valida `kind` y se rechaza.
- ✅ **Moneda base siempre GTQ**: `currency DEFAULT 'GTQ'` en el schema; el consumido suma `amount_base_cents` (de transacciones ya convertidas al momento del registro, I-03).
- ✅ **Upsert**: `UNIQUE(space_id, category_id, period_year, period_month)` garantiza un solo presupuesto por categoría/mes/espacio.
- ✅ **Consumido excluye transferencias** (I-04): solo suman `amount_base_cents` de transacciones `expense` e `income`.
- ✅ **Filtro por `occurred_on`**: el consumido se calcula según la fecha de negocio, no la de creación (I-09).
- ✅ **Sin alertas push/email**: fuera del MVP (AGENT.md §3.2); el porcentaje y `overBudget` boolean son la alerta implícita.
- ✅ **Auditoría (I-11)**: create, update, delete en `audit_log`.

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

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de presupuestos.*
