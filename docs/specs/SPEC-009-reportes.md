---
spec_id: SPEC-009
titulo: Reportes del mes
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-008]
adrs: [ADR-003, ADR-004]
---

# SPEC-009 — Reportes del mes

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

El dueño necesita consultar su situación financiera del mes: cuánto gastó, cuánto ingresó, cuál es el balance, por dónde se fue el dinero, y cómo se compara con el mes anterior. Sin reportes, registra gastos sin visibilidad y no puede tomar decisiones informadas. Los totales deben ser **exactos al centavo** (objetivo §2.3 del AGENT.md) y las transferencias **nunca deben aparecer** en los totales de gasto o ingreso.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño consulta el resumen del mes desde el móvil, a menudo al final del período o al hacer un gasto nuevo |
| Escenario | Abre la app el 1 de octubre, consulta resumen de septiembre: total de gastos, ingresos, balance, desglose por categoría con presupuesto vs real, comparación con agosto |
| Limitaciones | La consulta debe ser rápida y exacta; el móvil es el dispositivo principal |
| Riesgo principal | Que los totales no cuadren al centavo, que las transferencias se incluyan en gastos/ingresos, o que la comparación con el mes anterior sea imprecisa |

## 3. Objetivo (falsable)

> El sistema presenta el total del mes por categoría y por cuenta, el balance global, y la comparación con el mes anterior, con diferencia de **0 centavos** respecto a la suma exacta de transacciones.

**No se cumple si:**

- La suma de totales por categoría no es igual al total del mes (diferencia ≠ 0 centavos).
- Una transferencia aparece en los totales de gasto o ingreso (I-04).
- Se usa `created_at` en lugar de `occurred_on` para filtrar el mes (I-09).
- El balance no se calcula con aritmética entera (I-01).
- Los montos no están en moneda base (GTQ).

## 4. Alcance

### 4.1 Incluye

- Resumen del mes: total de gastos, total de ingresos y balance (ingresos − gastos) en moneda base GTQ.
- Desglose por categoría: consumo por categoría con comparación presupuesto vs real (viene de SPEC-006).
- Desglose por cuenta: saldos (opening_balance + movimientos) y movimientos listados.
- Comparación mes actual vs mes anterior: mismas métricas para ambos meses y diferencia absoluta/porcentaje.
- Filtro por `occurred_on` (no `created_at`) según zona `America/Guatemala` (I-09).
- Transferencias excluidas de totales de gasto/ingreso, incluidas en balances de cuenta (I-04).
- Todo en centavos enteros, sin coma flotante (I-01, I-02).

### 4.2 No incluye

- Reportes de meses cerrados inmutables (eso es fase 2, AGENT.md §3.2).
- Reportes personalizados con filtros arbitrarios (solo year+month).
- Gráficos, visualizaciones avanzadas o exportación.
- Alertas automáticas de exceso de presupuesto (fuera del MVP, AGENT.md §3.2).
- Reportes en moneda distinta a GTQ (moneda base, AGENT.md §8.1).

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — consultar resumen del mes

1. El dueño autenticado abre la sección de reportes.
2. El sistema calcula para el mes y año dados (`period_year`, `period_month`):
   - **Total de gastos**: `SUM(amount_base_cents WHERE kind = 'expense' AND occurred_on in month AND space_id = X)` (transferencias excluidas, I-04)
   - **Total de ingresos**: `SUM(amount_base_cents WHERE kind = 'income' AND occurred_on in month AND space_id = X)` (transferencias excluidas, I-04)
   - **Balance**: `total_ingresos − total_gastos`
3. Todos los montos usan `amount_base_cents` ya congelado (I-03, SPEC-008).
4. El resultado se presenta en centavos enteros con formato monetario `es-GT` (AGENT.md §12.5).
5. Si no hay transacciones, los totales son 0.

### 5.2 Flujo principal — desglose por categoría

1. Para cada categoría de gasto del espacio con transacciones en el mes:
   - `spent = SUM(amount_base_cents WHERE kind = 'expense' AND category_id = Y AND occurred_on in month)`
   - Se une con el presupuesto de SPEC-006 para ese `(category_id, year, month)`
   - `percentage = round(spent / budget_amount * 100)` si budget > 0, else null
   - `over_budget = true` si `spent > budget_amount`
2. Categorías sin transacciones no aparecen (o aparecen con spent=0).
3. **Regla de cuadre**: `SUM(spent_por_categoria) = total_gastos` (0 diferencia de centavos).

### 5.3 Flujo principal — desglose por cuenta

1. Para cada cuenta del espacio:
   - **Saldo actual**: `opening_balance_cents + SUM(amount_base_cents WHERE account_id = Z)` (incluye todas las transacciones: expense, income, transfer)
   - **Lista de movimientos**: transacciones ordenadas por `occurred_on` descendente, con su `kind`, `amount_cents`, `currency`, `amount_base_cents`, `category_id`, `occurred_on`
2. Las transferencias **sí** afectan el saldo de la cuenta (entran y salen dinero de la cuenta).
3. Cuentas archivadas aparecen con su historial completo (no se borra el historial).

### 5.4 Flujo principal — comparación mes actual vs anterior

1. El sistema calcula las mismas métricas para el mes actual y el mes anterior.
2. **Diferencia absoluta**: `abs(total_gastos_actual − total_gastos_anterior)`
3. **Diferencia porcentual**: `round((actual − anterior) / anterior * 100)` (si anterior > 0, else null)
4. Se compara por categoría y por total.

### 5.5 Flujos alternativos

- **Mes sin transacciones** → totales = 0, balance = 0, comparación con mes anterior si existe.
- **Primer mes** (sin mes anterior) → comparación no disponible, se indica.
- **Cuenta sin movimientos** → saldo = opening_balance, movimientos vacíos.
- **Categoría sin presupuesto (SPEC-006)** → `percentage` y `over_budget` son null/false.

### 5.6 Casos límite

- **Transferencia cruzada de meses** → la pata origen y la pata destino pueden tener `occurred_on` en meses distintos; cada una aparece en su mes correspondiente (I-09), pero nunca en totales de gasto/ingreso (I-04).
- **Múltiples transacciones con misma categoría y mes** → la suma debe cuadrar exactamente al centavo (I-02).
- **Gastos en USD** → se suman `amount_base_cents` (congelados al registrar, I-03).
- **Mes vacío vs mes inexistente** → totales 0 (no error).
- **Categoría con presupuesto pero sin transacciones** → spent=0, percentage=0%.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Total del mes sin transferencias | el dueño tiene gastos por Q1000 e ingresos por Q2000 en 09/2026 (sin transferencias) | consulta `/api/reports/summary?year=2026&month=9` | totalGastos=100000, totalIngresos=200000, balance=100000 |
| AC-02 | Transferencia excluida de totales | el dueño tiene un gasto Q100 y una transferencia Q50 en 09/2026 | consulta resumen | totalGastos=10000 (no incluye los Q50 de la transferencia) (I-04) |
| AC-03 | Cuadre de totales por categoría | el dueño tiene gastos en 2 categorías: Q600 y Q400 | suma los totales por categoría | suma = total del mes (0 diferencia de centavos) (§2.4) |
| AC-04 | Usar occurred_on, no created_at | el dueño tiene una transacción con `occurredOn=2026-09-30` y `createdAt=2026-10-01` | consulta resumen de 09/2026 | la transacción aparece en septiembre (I-09) |
| AC-05 | Montos en centavos enteros | el dueño tiene transacciones | consulta cualquier reporte | todos los montos son INTEGER, sin REAL (I-01) |
| AC-06 | Moneda base GTQ | el dueño tiene gastos en USD (convertedidos a GTQ) | consulta resumen | todos los montos están en `amount_base_cents` (GTQ), moneda base |
| AC-07 | Tasa congelada preservada | el dueño tiene una transacción USD registrada con tasa X | consulta reporte | el monto en reporte refleja `amount_base_cents` con tasa X congelada (I-03) |
| AC-08 | Presupuesto vs real por categoría | el dueño tiene presupuesto Q500 para Comida y gastos Q600 en Comida en 09/2026 | consulta `/api/reports/by-category?year=2026&month=9` | spent=60000, budget=50000, percentage=120, overBudget=true (SPEC-006) |
| AC-09 | Categoría sin presupuesto | el dueño tiene una categoría sin presupuesto definido | consulta `/api/reports/by-category` | percentage=null, overBudget=false para esa categoría |
| AC-10 | Saldo de cuenta con transferencia | el dueño tiene una cuenta con opening_balance=Q1000 y transfiere Q500 a otra cuenta | consulta `/api/reports/by-account?year=2026&month=9` | saldo=Q500 (incluye la transferencia, que afecta el balance) |
| AC-11 | Saldo de cuenta con gasto e ingreso | el dueño tiene cuenta con opening_balance=Q1000, gasta Q200, ingresa Q300 | consulta balance | saldo=Q1100 |
| AC-12 | Comparación mes actual vs anterior | el dueño tiene gastos Q1000 en 09/2026 y Q800 en 08/2026 | consulta `/api/reports/compare?year=2026&month=9` | diffAbs=20000, diffPercent=25 |
| AC-13 | Primer mes (sin mes anterior) | el dueño consulta enero como primer mes | consulta `/api/reports/compare?year=2026&month=1` | diffAbs=null, diffPercent=null (sin mes anterior para comparar) |
| AC-14 | Mes sin transacciones | el dueño no tiene transacciones en 09/2026 | consulta resumen | totalGastos=0, totalIngresos=0, balance=0 |
| AC-15 | Aislamiento por espacio (I-07) | el dueño tiene transacciones en su espacio | consulta cualquier reporte | solo ve datos de su espacio (404, no 403) |
| AC-16 | Reporte con múltiples monedas | el dueño tiene gastos en GTQ y USD en 09/2026 | consulta resumen | todos los montos convertidos a GTQ (amount_base_cents), suma exacta al centavo |

## 7. Ejemplos ejecutables

```bash
# 1. Resumen del mes
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/reports/summary?year=2026&month=9'

# respuesta esperada:
# { "totalExpenses": 100000, "totalIncome": 200000, "balance": 100000,
#   "currency": "GTQ", "periodYear": 2026, "periodMonth": 9 }

# 2. Desglose por categoría con presupuesto vs real
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/reports/by-category?year=2026&month=9'

# respuesta esperada:
# [{ "categoryId":"…", "categoryName":"Comida", "spentCents":60000,
#    "budgetCents":50000, "percentage":120, "overBudget":true },
#  { "categoryId":"…", "categoryName":"Transporte", "spentCents":40000,
#    "budgetCents":50000, "percentage":80, "overBudget":false }]

# 3. Desglose por cuenta
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/reports/by-account?year=2026&month=9'

# respuesta esperada:
# [{ "accountId":"…", "accountName":"Efectivo GTQ", "currency":"GTQ",
#    "openingBalanceCents":100000, "currentBalanceCents":85000,
#    "transactions":[{ "id":"…", "kind":"expense", "amountCents":15000,
#       "currency":"GTQ", "amountBaseCents":15000, "categoryId":"…",
#       "occurredOn":"2026-09-21" }] }]

# 4. Comparación con mes anterior
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/reports/compare?year=2026&month=9'

# respuesta esperada:
# { "current": { "totalExpenses": 100000, "totalIncome": 200000, "balance": 100000 },
#   "previous": { "totalExpenses": 80000, "totalIncome": 180000, "balance": 100000 },
#   "diffExpenses": 20000, "diffExpensesPercent": 25,
#   "diffIncome": 20000, "diffIncomePercent": 11,
#   "diffBalance": 0, "diffBalancePercent": 0 }
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Todo en centavos enteros (`INTEGER`); sin `REAL` (I-01) |
| Técnica | Aritmética entera con redondeo half-up (I-02) |
| Técnica | Filtro por `occurred_on` (I-09), nunca `created_at` |
| Técnica | Transacciones con `transfer_group_id IS NOT NULL` excluidas de totales de gasto/ingreso (I-04) |
| Técnica | Todo acceso a datos filtra por `space_id` (I-07) |
| De negocio | Moneda base siempre GTQ; `amount_base_cents` ya está congelado (I-03) |
| De negocio | Balance = total ingresos − total gastos (en centavos) |
| De negocio | Saldo de cuenta = `opening_balance_cents + SUM(amount_base_cents)` (incluye transferencias) |
| De negocio | Presupuesto vs real viene de SPEC-006 (upsert por `space_id, category_id, year, month`) |
| De negocio | Comparación requiere calcular ambos meses antes de mostrar |
| De negocio | Sin mes anterior → diffAbs y diffPercent son null |
| De seguridad | Auditoría mínima; no se registra en `audit_log` la consulta de reportes (solo mutaciones, I-11) |
| De seguridad | Sin exponer `password_hash`, `salt` u otros usuarios (I-10) |
| De seguridad | Sin loggear montos, descripciones ni emails (I-12) |

## 9. Contratos

Los endpoints de reportes están definidos en `docs/API.md` §11:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/reports/summary?year=&month=` | total de gastos, ingresos y balance en moneda base |
| GET | `/api/reports/by-category?year=&month=` | incluye presupuesto vs real |
| GET | `/api/reports/by-account?year=&month=` | saldos y movimientos |
| GET | `/api/reports/compare?year=&month=` | mes actual vs anterior |

**Respuesta de resumen** (ejemplo):

```json
{
  "totalExpenses": 100000,
  "totalIncome": 200000,
  "balance": 100000,
  "currency": "GTQ",
  "periodYear": 2026,
  "periodMonth": 9
}
```

**Respuesta de comparación** (ejemplo):

```json
{
  "current": { "totalExpenses": 100000, "totalIncome": 200000, "balance": 100000 },
  "previous": { "totalExpenses": 80000, "totalIncome": 180000, "balance": 100000 },
  "diffExpenses": 20000, "diffExpensesPercent": 25,
  "diffIncome": 20000, "diffIncomePercent": 11,
  "diffBalance": 0, "diffBalancePercent": 0
}
```

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones

- ✅ **Transferencias excluidas de totales** (I-04): `transfer_group_id IS NOT NULL` excluido de gastos/ingresos, pero incluido en balances de cuenta.
- ✅ **`occurred_on` para filtrar** (I-09): nunca `created_at`. El mes se determina por la fecha de negocio.
- ✅ **`amount_base_cents` congelado** (I-03): los reportes usan el valor ya calculado y almacenado; no se recalcula.
- ✅ **Regla de cuadre**: `SUM(spent_por_categoria) = total_gastos` con 0 diferencia de centavos (objetivo §2.3, §2.4).
- ✅ **Presupuesto vs real** (SPEC-006): el reporte por categoría se une con la tabla `budgets` por `(space_id, category_id, year, month)`.
- ✅ **Saldo de cuenta incluye transferencias**: el balance de la cuenta refleja todas las transacciones (expense, income, transfer), no solo gastos/ingresos.
- ✅ **Sin `REAL`**: toda aritmética en centavos enteros, sin coma flotante (I-01).
- ✅ **Sin log de reportes**: las consultas no generan entradas en `audit_log` (solo mutaciones, I-11).
- ✅ **Sin alertas automáticas**: el reporte muestra `overBudget` boolean; las alertas son responsabilidad del usuario.
- ✅ **Sin mes cerrado inmutable**: fase 2. En el MVP, cualquier mes puede editarse y los reportes reflejan el estado actual.

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

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de reportes.*
