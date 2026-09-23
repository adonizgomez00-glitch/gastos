---
spec_id: SPEC-007
titulo: Gastos e ingresos recurrentes
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-008, SPEC-009, SPEC-010]
adrs: [ADR-003, ADR-004, ADR-006]
---

# SPEC-007 — Gastos e ingresos recurrentes

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

El dueño tiene gastos e ingresos que se repiten periódicamente (sueldo mensual, suscripción, alquiler). Registrarlos uno por uno cada mes es lento y propenso a errores. Sin reglas recurrentes, el dueño pierde tiempo y la información se vuelve inconsistente. Las reglas recurrentes deben **generar transacciones periódicas de forma idempotente** (una sola por período), aplicando la misma lógica de tasa congelada que una transacción manual.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño registra gastos fijos mensuales (suscripciones, alquiler) e ingresos periódicos (sueldo) |
| Escenario | Define una regla mensual de Q1,500 para "Suscripción", y el sistema genera una transacción el primer día de cada mes |
| Limitaciones | Uso principal desde el móvil con prisa; la generación puede ocurrir bajo demanda (botón) o al arranque |
| Riesgo principal | Que un período se genere dos veces (doble gasto) o que falte un período (gasto no registrado) |

## 3. Objetivo (falsable)

> El sistema permite definir reglas de gasto/ingreso recurrente con frecuencia diaria, generar transacciones periódicas de forma **idempotente** (una sola por período), y pausar/editar reglas sin alterar el histórico.

**No se cumple si:**

- Ejecutar el generador dos veces genera dos transacciones para el mismo período (I-06).
- Una transacción recurrente no conserva la tasa congelada al momento de generarse (I-03).
- Al editar una regla, se regeneran o modifican períodos ya generados.
- La regla cruza espacios (I-07).

## 4. Alcance

### 4.1 Incluye

- Crear, consultar, editar (PATCH) y pausar reglas recurrentes con `kind = 'expense'` o `'income'`, frecuencia (`monthly`, `weekly`, `biweekly`, `yearly`), monto, moneda, cuenta, categoría, descripción, fecha de inicio, fecha de fin opcional.
- Generación bajo demanda (`POST /api/recurring/run`) de períodos pendientes hasta la fecha de hoy (o una fecha inyectada en tests).
- Idempotencia: un período se genera una sola vez por regla (`UNIQUE(rule_id, period_key)`, I-06).
- Cada transacción generada aplica la tasa congelada del día de generación (I-03) y sigue las mismas validaciones que SPEC-004.
- Auditoría de creación, edición y generación en `audit_log` (I-11).
- `nextRunOn` visible en la consulta para saber cuándo vence el siguiente período.

### 4.2 No incluye

- Transferencias recurrentes (una transacción requiere dos cuentas; las transferencias son SPEC-005).
- Ajuste automático de monto por inflación o índice.
- Notificaciones o recordatorios (AGENT.md §3.2).
- Generación asíncrona por cron en el servidor (se hace bajo demanda o al arranque).

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — crear regla recurrente

1. El dueño autenticado abre la sección de recurrentes.
2. Ingresa: tipo (gasto/ingreso), cuenta, categoría, monto, moneda, frecuencia, día/semana de referencia, descripción y fecha de inicio.
3. El sistema valida:
   - La cuenta existe, pertenece al espacio, está activa y su moneda es compatible (GTQ/USD).
   - La categoría existe, pertenece al espacio y su `kind` coincide con el `kind` de la regla.
   - El monto es un entero positivo en centavos (`amount_cents > 0`, I-08).
   - La frecuencia y los parámetros (`day_of_month`, `weekday`) son válidos para esa frecuencia.
   - La fecha de inicio (`start_on`) es previa o igual a hoy (zona `America/Guatemala`, I-09).
4. Se calcula `next_run_on` como la primera ocurrencia posteriores a `start_on` según la frecuencia.
5. Se guarda la regla con `active = 1` y se registra en `audit_log`.
6. La regla queda lista para que el generador cree transacciones periódicas.

### 5.2 Flujo principal — generar transacciones pendientes

1. El dueño (o el arranque del servidor) invoca `POST /api/recurring/run`.
2. El sistema busca reglas activas con `next_run_on <= today`.
3. Para cada regla, calcula los períodos pendientes desde `next_run_on` hasta `today` (o la fecha inyectada).
4. Para cada período:
   - Calcula el `period_key` (determinístico: `YYYY-MM` para monthly, etc.).
   - Si ya existe un registro en `recurring_runs` para `(rule_id, period_key)` → **salta** (idempotencia, I-06).
   - Si no → crea una transacción con los mismos datos que SPEC-004 (monto, cuenta, categoría, descripción, `occurred_on` = fecha del período), aplica la tasa congelada del día de generación, y registra un `recurring_runs` con el `period_key` y `transaction_id`.
5. `BEGIN → INSERT transacción + INSERT recurring_runs + audit_log → COMMIT` para cada período.
6. Al final, se actualiza `next_run_on` de la regla.

### 5.3 Flujos alternativos

- **Regla con `end_on`** → no genera períodos posterior a `end_on`.
- **Cuenta archivada o inactiva al generar** → el generador **salta** el período (no genera) y avanza `next_run_on` al siguiente; no borra la regla.
- **Edición que cambia monto/frecuencia** → solo afecta generaciones futuras; períodos ya generados no se modifican.
- **Pausar regla** → `active = 0`; el generador la ignora.
- **Tasa no disponible** → si la regla es en USD y no hay tasa válida, el período se salta (no genera) y se avanza.

### 5.3 Casos límite

- **Febrero (29/30/31)** → si `day_of_month` > días del mes, se ajusta al último día del mes.
- **Mes de referencia** → el `period_key` se deriva de la fecha del período, no del día de generación (I-06).
- **Generación múltiple de un período fallido** → el `recurring_runs` con `period_key` se inserta junto a la transacción en la misma transacción atómica; si falla, nada queda.
- **Regla con `start_on` en el futuro** → `next_run_on = start_on`; no genera períodos pasados.
- **Biweekly** → el `period_key` alterna pares de semanas respetando la paridad de la semana ISO de referencia.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Crear regla mensual | el dueño tiene sesión válida, una cuenta en GTQ y una categoría de gasto | crea una regla con `frequency=monthly`, `dayOfMonth=5`, monto Q1,500, `startOn=2026-09-01` | la regla queda con `nextRunOn=2026-10-05`, `active=1` |
| AC-02 | Crear regla en USD | el dueño tiene una cuenta en USD y una categoría de gasto | crea una regla en USD, monto $50 | la regla queda registrada con `currency=USD`; al generar, se aplica tasa congelada (I-03) |
| AC-03 | Generar múltiples períodos | el dueño tiene una regla mensual con `startOn=2026-07-01` y `nextRunOn=2026-07-05` | ejecuta `/api/recurring/run` con `today=2026-09-20` | se generan transacciones para 07/05, 08/05, 09/05 (3 períodos) |
| AC-04 | Idempotencia (I-06) | el dueño tiene una regla con períodos pendientes | ejecuta `/api/recurring/run` dos veces seguidas | la segunda ejecución no genera nuevas transacciones; una sola por período |
| AC-05 | No regenerar período ya generado | el período 09/2026 ya fue generado (existe `recurring_runs`) | ejecuta `/api/recurring/run` | el período 09 no se genera de nuevo; avanza al siguiente |
| AC-06 | Tasa congelada al generar (I-03) | la regla es en USD con tasa X al momento de generación | la tasa cambia a Y después de la generación | la transacción generada conserva tasa X; `fxRateMicro` y `amountBaseCents` no cambian |
| AC-07 | Editar regla sin afectar períodos pasados | la regla tiene transacciones generadas para períodos anteriores | cambia el monto de la regla | los períodos ya generados no cambian; futuros usan el nuevo monto |
| AC-08 | Pausar regla | el dueño tiene una regla activa | pausa la regla (`active=0`) | el generador ignora la regla; no genera períodos nuevos |
| AC-09 | Cuenta archivada al generar | la regla tiene `nextRunOn` en el pasado y la cuenta está archivada | ejecuta `/api/recurring/run` | el período se salta; `nextRunOn` avanza al siguiente; no se genera transacción |
| AC-10 | Aislamiento por espacio (I-07) | existe una regla en el espacio B | el dueño intenta consultar/generar en su espacio | no ve ni accede a reglas de otro espacio |
| AC-11 | Rechazar regla con categoria de tipo distinto | el dueño tiene una categoría `kind=income` | crea una regla de `kind=expense` con esa categoría | rechazo con `422` / `CATEGORY_KIND_MISMATCH` |
| AC-12 | Rechazar monto cero | el dueño intenta crear una regla con `amountCents=0` | envía la petición | rechazo con `422` / `INVALID_AMOUNT` (I-08) |
| AC-13 | End_on detiene la generación | la regla tiene `endOn=2026-09-15` | ejecuta `/api/recurring/run` con `today=2026-09-20` | no genera períodos después de `2026-09-15` |
| AC-14 | Audit log de regla | el dueño crea/edita/pausa/borra una regla | se registra en `audit_log` | aparece con `entity=recurring_rules`, `action=create/update/delete`, `before_json`/`after_json` (I-11) |
| AC-15 | Febrero ajusta día al final | la regla tiene `dayOfMonth=31` y `startOn=2026-02-15` | se calcula la primera ocurrencia | `nextRunOn=2026-02-28` (último día del mes) |
| AC-16 | Tasa no disponible salta período | la regla es en USD y no hay tasa válida | ejecuta `/api/recurring/run` | el período se salta (no genera); avanza `nextRunOn`; no inventa tasa |

## 7. Ejemplos ejecutables

```bash
# 1. Crear regla mensual en GTQ
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"kind":"expense","accountId":"<id>","categoryId":"<id>","amountCents":150000,"currency":"GTQ","frequency":"monthly","dayOfMonth":5,"description":"Suscripción","startOn":"2026-09-01"}' \
  http://127.0.0.1:8100/api/recurring

# respuesta esperada:
# { "id":"…", "kind":"expense", "accountId":"…", "categoryId":"…",
#   "amountCents":150000, "currency":"GTQ", "frequency":"monthly",
#   "dayOfMonth":5, "description":"Suscripción", "startOn":"2026-09-01",
#   "endOn":null, "nextRunOn":"2026-10-05", "active":1 }

# 2. Generar transacciones pendientes
curl -s -b /tmp/gastos.cookies -X POST \
  http://127.0.0.1:8100/api/recurring/run

# respuesta esperada:
# { "generated": 3, "transactions":[
#   {"id":"…","kind":"expense","amountCents":150000,"currency":"GTQ","amountBaseCents":150000,"occurredOn":"2026-07-05"},
#   {"id":"…","kind":"expense","amountCents":150000,"currency":"GTQ","amountBaseCents":150000,"occurredOn":"2026-08-05"},
#   {"id":"…","kind":"expense","amountCents":150000,"currency":"GTQ","amountBaseCents":150000,"occurredOn":"2026-09-05"}
# ]}

# 3. Pausar regla
curl -s -b /tmp/gastos.cookies -X PATCH -H 'Content-Type: application/json' \
  -d '{"active":0}' \
  http://127.0.0.1:8100/api/recurring/<id>
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Dinero en centavos (`INTEGER`); sin `REAL`; I-01 |
| Técnica | Idempotencia por `UNIQUE(rule_id, period_key)` en `recurring_runs` (I-06) |
| Técnica | Generación atómica: `BEGIN → INSERT transacción + INSERT recurring_runs + audit_log → COMMIT` |
| Técnica | SQL solo vía `prepare()` con parámetros |
| De negocio | `kind` de la regla ∈ {`expense`, `income`} (no `transfer`) |
| De negocio | `frequency` ∈ {`monthly`, `weekly`, `biweekly`, `yearly`} |
| De negocio | `amount_cents > 0` (I-08) |
| De negocio | Cuenta y categoría deben pertenecer al espacio y estar activos |
| De negocio | `day_of_month` solo para `monthly`; `weekday` solo para `weekly` |
| De negocio | Edición de regla no afecta períodos ya generados |
| De negocio | Cuenta archivada → período se salta (no genera) |
| De negocio | Sin tasa válida → período se salta (no inventa) |
| De seguridad | Auditoría obligatoria en `audit_log` (I-11) |
| De seguridad | Solo el dueño autenticado opera reglas de su espacio (I-07) |

## 9. Contratos

Los endpoints de recurrentes están definidos en `docs/API.md` §9:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/recurring` | reglas con `nextRunOn` |
| POST | `/api/recurring` | `{ kind, accountId, categoryId, amountCents, currency, frequency, dayOfMonth?, startOn }` |
| PATCH | `/api/recurring/:id` | pausar/editar (no reescribe transacciones pasadas) |
| POST | `/api/recurring/run` | genera lo pendiente; **idempotente** (I-06) |

**Respuesta al crear** (ejemplo):

```json
{
  "id": "…",
  "kind": "expense",
  "accountId": "…",
  "categoryId": "…",
  "amountCents": 150000,
  "currency": "GTQ",
  "frequency": "monthly",
  "dayOfMonth": 5,
  "description": "Suscripción",
  "startOn": "2026-09-01",
  "endOn": null,
  "nextRunOn": "2026-10-05",
  "active": 1
}
```

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones

- ✅ **Idempotencia por `period_key`**: `UNIQUE(rule_id, period_key)` en `recurring_runs` garantiza una sola transacción por período (I-06).
- ✅ **No se regeneran períodos ya generados**: si existe `recurring_runs` para `(rule_id, period_key)`, se salta (AC-05).
- ✅ **Edición no afecta períodos pasados**: PATCH solo afecta generaciones futuras; períodos ya generados no se modifican (AC-07).
- ✅ **Cuenta archivada → salto de período**: si la cuenta está archivada al momento de generar, el período se omite y `nextRunOn` avanza (AC-09).
- ✅ **Tasa no disponible → salto de período**: si la regla es en USD y no hay tasa válida, el período se omite (AC-16).
- ✅ **Sin tasa, no se inventa**: alineado con SPEC-008 AC-04 y ADR-004.
- ✅ **`day_of_month = 31` en febrero → 28/29**: se ajusta al último día del mes (AC-15).
- ✅ **No transferencias recurrentes**: una regla genera una sola transacción (SPEC-005).
- ✅ **Refresco al arranque + `/api/recurring/run` bajo demanda**: no hay cron/timer en el MVP (ADR-004 §8.4).
- ✅ **Fechas de negocio en `America/Guatemala`**: `occurred_on` y `next_run_on` en zona local; `created_at`/`updated_at` en UTC (I-09).

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

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de recurrentes.*
