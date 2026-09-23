---
spec_id: SPEC-004
titulo: Transacciones (gastos e ingresos)
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-003, SPEC-005, SPEC-008, SPEC-009, SPEC-010]
adrs: [ADR-003, ADR-004, ADR-006]
---

# SPEC-004 — Transacciones (gastos e ingresos)

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

Sin un registro de transacciones, el dinero se va sin rastro: al final del mes no se sabe cuánto se gastó en qué, ni cuánto del gasto está en dólares con cotización distinta. La transacción es el **núcleo** de toda la aplicación — sin ella no hay reportes, presupuestos ni transferencias. Registrar un gasto desde el móvil debe ser rapidísimo, o no se usa.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño registra gastos e ingresos en el momento del gasto, desde el navegador del móvil, de pie, en la caja, con prisa |
| Escenario | Registra un gasto de Q50 en comida desde su cuenta de débito; el sistema congela la tasa si está en USD; después consulta el total del mes |
| Limitaciones | Dispositivo principal es el móvil; el registro debe ser ≤ 20 segundos (objetivo §2.3 del AGENT.md); sin red no se registra nada |
| Riesgo principal | Que el registro sea lento, que la tasa se recalcule después, o que los totales no cuadren al centavo |

## 3. Objetivo (falsable)

> El sistema permite registrar un gasto o ingreso desde el móvil en ≤ 20 segundos, con monto, moneda, cuenta, categoría y fecha, y consultar el total del mes por categoría exacto al centavo.

**No se cumple si:**

- El registro toma más de 20 segundos en un dispositivo móvil promedio.
- Los totales por categoría no cuadran con el total del mes al centavo.
- La tasa de cambio se recalcula después de registrada (I-03).
- Se permite registrar una transacción con monto cero o negativo (I-08).

## 4. Alcance

### 4.1 Incluye

- Crear, editar, consultar y archivar transacciones de tipo gasto (`expense`) e ingreso (`income`).
- Monto en centavos, moneda (GTQ o USD), cuenta, categoría, fecha de negocio y descripción.
- Conversión automática a moneda base (GTQ) con tasa congelada al registrar (I-03).
- Consulta de transacciones con filtros (rango de fechas, cuenta, categoría, tipo) y paginación.
- Edición de transacción: si cambia monto o moneda, la tasa se re-congela (nueva versión auditada).
- Archivado lógico de transacciones (consistent con I-05 y las decisiones del proyecto).
- Reembolso (`refund`): genera la transacción inversa enlazada.
- Auditoría de toda mutación en `audit_log` (I-11).

### 4.2 No incluye

- Transferencias entre cuentas (eso es SPEC-005).
- Gastos e ingresos recurrentes (eso es SPEC-007).
- Reportes del mes y por categoría (eso es SPEC-009).
- Presupuestos mensuales por categoría (eso es SPEC-006).
- Importación de extractos bancarios (CSV/OFX/Excel) y scraping bancario.
- Adjuntar fotos o PDFs de recibos.
- Modo offline o sincronización.

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — crear transacción

1. El dueño autenticado abre la pantalla de registro rápido.
2. Selecciona tipo (gasto o ingreso), cuenta, categoría, ingresa monto y moneda; opcionalmente fecha y descripción.
3. El sistema valida:
   - La cuenta existe, pertenece al espacio del dueño y está activa (no archivada).
   - La categoría existe, pertenece al espacio, y su `kind` coincide con el tipo de transacción.
   - El monto es un entero positivo en centavos (`amount_cents > 0`, I-08).
   - La moneda está soportada (GTQ o USD).
   - La fecha es válida y en la zona `America/Guatemala` (I-09).
4. Si la moneda es distinta a la base (GTQ), el sistema obtiene la tasa del día:
   - Cadena de resolución: caché → primaria (`er-api`) → secundaria (`banguat`) → carry-forward → manual.
   - Si no hay tasa válida, **rechaza** la operación; nunca inventa una tasa.
5. Se calcula `amount_base_cents` con aritmética entera y redondeo half-up (I-02).
6. Se **congelan** en la transacción: `amount_cents`, `currency`, `fx_rate_micro`, `amount_base_cents`, `rate_date`, `rate_source` (I-03).
7. Se ejecuta `BEGIN → INSERT transaction + audit_log → COMMIT`.
8. Se devuelve la transacción completa con todos los campos congelados.

### 5.2 Flujos alternativos

- **Moneda base (GTQ)** → no se consulta tasa; `fx_rate_micro = NULL`, `rate_date = NULL`, `rate_source = NULL`, `amount_base_cents = amount_cents`.
- **Edición que cambia monto o moneda** → se re-obtiene la tasa y se re-congela (nueva versión auditada con `before_json`/`after_json`).
- **Edición que no cambia monto ni moneda** → solo se actualizan los campos editables (descripción, notas, categoría, fecha) sin tocar la tasa.
- **Reembolso (`refund`)** → se crea una nueva transacción inversa (`kind` invertido, monto igual) enlazada por `notes` o campo de referencia; la original queda archivada.
- **Archivar transacción** → `archived = 1`; no se borra; los reportes la excluyen del mes vigente pero el histórico se mantiene.

### 5.3 Casos límite

- Transacción en moneda USD cuando no hay tasa disponible → rechazo con código `RATE_UNAVAILABLE`.
- Transacción con categoría de tipo distinto al `kind` de la transacción → rechazo con `422`.
- Transacción en cuenta archivada → rechazo con `422`.
- Transacción con `occurred_on` vacío → rechazo; es obligatorio.
- Transacción con monto 0 → rechazo (I-08: `CHECK(amount_cents > 0)`).
- La descripción es obligatoria (campo NOT NULL en el schema); las notas son opcionales.
- `transfer_group_id` siempre `NULL` en esta spec (transferencias son SPEC-005).

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Crear gasto en GTQ | el dueño tiene sesión válida, una cuenta activa en GTQ y una categoría de gasto | registra un gasto de Q50.00 (5000 centavos) en la cuenta con la categoría | la transacción queda registrada con `kind=expense`, `amountCents=5000`, `currency=GTQ`, `amountBaseCents=5000`, `fxRateMicro=NULL`, `rateSource=NULL` |
| AC-02 | Crear ingreso en GTQ | el dueño tiene sesión válida, una cuenta activa en GTQ y una categoría de ingreso | registra un ingreso de Q100.00 | la transacción queda registrada con `kind=income` y los montos correctos |
| AC-03 | Crear gasto en USD con conversión | el dueño tiene una cuenta en USD, una categoría de gasto, y hay tasa vigente (ej. 7.703054 GTQ/USD) | registra un gasto de $5.00 (500 centavos) en USD | la transacción queda con `amountCents=500`, `currency=USD`, `fxRateMicro=7703054`, `amountBaseCents=3852`, `rateDate=<hoy>`, `rateSource=er-api` (o la fuente que respondió) |
| AC-04 | Tasa congelada no cambia | una transacción en USD fue registrada con tasa X | la tasa vigente cambia a Y después del registro | la transacción mantiene la tasa X; su `fxRateMicro` y `amountBaseCents` no cambian (I-03) |
| AC-05 | Rechazar monto cero | el dueño tiene sesión válida | intenta registrar una transacción con `amountCents=0` | el sistema rechaza con `422` y código `INVALID_AMOUNT` (I-08) |
| AC-06 | Rechazar monto negativo | el dueño tiene sesión válida | intenta registrar una transacción con monto negativo | el sistema rechaza con `422` y código `INVALID_AMOUNT` (I-08) |
| AC-07 | Rechazar gasto con categoría de ingreso | el dueño tiene una categoría de tipo `income` | intenta registrar un gasto (`kind=expense`) con esa categoría | el sistema rechaza con `422` y código `CATEGORY_KIND_MISMATCH` |
| AC-08 | Rechazar transacción en cuenta archivada | el dueño tiene una cuenta archivada | intenta registrar una transacción en esa cuenta | el sistema rechaza con `422` y código `ACCOUNT_ARCHIVED` |
| AC-09 | Rechazar transacción en cuenta de otro espacio | existe una cuenta de otro espacio (no visible) | el dueño intenta registrar una transacción con ese `accountId` | el sistema rechaza con `404` (no filtra existencia, I-07) |
| AC-10 | Rechazar sin tasa disponible | el dueño tiene una cuenta en USD y no hay tasa (ni caché, ni proveedor, ni carry-forward, ni manual) | intenta registrar un gasto en USD | el sistema rechaza con `422` y código `RATE_UNAVAILABLE` |
| AC-11 | Carry-forward reutiliza tasa con origen real | no hay respuesta de proveedores pero hay carry-forward con `source=er-api` y `rate_date=2026-09-18` | se registra una transacción en USD | la transacción se registra con `rateSource=er-api` y `rateDate=2026-09-18` (no `carry-forward` como source) |
| AC-12 | Editar descripción sin cambiar monto | el dueño tiene una transacción registrada | cambia la descripción de la transacción | la transacción se actualiza; `fxRateMicro` y `amountBaseCents` no cambian |
| AC-13 | Editar monto en USD re-congela tasa | el dueño tiene una transacción en USD con tasa congelada | cambia el monto de 500 a 1000 centavos | se re-obtiene la tasa del día, se re-congela; `before_json` y `after_json` se registran en `audit_log` |
| AC-14 | Archivar transacción | el dueño tiene una transacción activa | archiva la transacción | queda con `archived=1`; no aparece en consultas del mes vigente |
| AC-15 | Reembolso genera transacción inversa | el dueño tiene un gasto registrado | solicita reembolso de esa transacción | se crea una nueva transacción con `kind=income` y el mismo monto, enlazada a la original |
| AC-16 | Aislamiento por espacio (I-07) | el dueño tiene transacciones en su espacio | consulta transacciones | solo ve las de su espacio; las de otro espacio no aparecen (404, no 403) |
| AC-17 | Totales por categoría cuadran | el dueño tiene 3 gastos en 2 categorías | consulta el total del mes por categoría | la suma de los totales por categoría es exactamente igual al total del mes (diferencia 0 centavos) |
| AC-18 | occurred_on correcto cerca de medianoche UTC | el dueño registra una transacción a las 23:59 de Guatemala (05:59 UTC siguiente día) | se guarda `occurred_on` | el `occurred_on` es el día correcto en `America/Guatemala`, no el UTC (I-09) |
| AC-19 | Consulta con filtros | el dueño tiene transacciones de distintos tipos, cuentas y fechas | consulta con filtros `from`, `to`, `accountId`, `categoryId`, `kind` | solo aparecen las que cumplen todos los filtros; paginación funciona correctamente |

## 7. Ejemplos ejecutables

```bash
# 1. Crear gasto en GTQ
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"kind":"expense","accountId":"<id>","categoryId":"<id>","amountCents":5000,"currency":"GTQ","occurredOn":"2026-09-21","description":"Almuerzo"}' \
  http://127.0.0.1:8100/api/transactions

# respuesta esperada:
# { "id":"…", "kind":"expense", "amountCents":5000, "currency":"GTQ",
#   "amountBaseCents":5000, "fxRateMicro":null, "rateDate":null, "rateSource":null,
#   "occurredOn":"2026-09-21", "description":"Almuerzo" }

# 2. Crear gasto en USD (con conversión)
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"kind":"expense","accountId":"<id-usd>","categoryId":"<id>","amountCents":500,"currency":"USD","occurredOn":"2026-09-21","description":"Suscripción"}' \
  http://127.0.0.1:8100/api/transactions

# respuesta esperada (tasa ej. 7.703054):
# { "id":"…", "kind":"expense", "amountCents":500, "currency":"USD",
#   "amountBaseCents":3852, "fxRateMicro":7703054, "rateDate":"2026-09-21",
#   "rateSource":"er-api", "occurredOn":"2026-09-21", "description":"Suscripción" }

# 3. Consultar transacciones del mes con filtros
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/transactions?from=2026-09-01&to=2026-09-30&kind=expense'

# 4. Archivar transacción
curl -s -b /tmp/gastos.cookies -X POST \
  http://127.0.0.1:8100/api/transactions/<id>/archive

# 5. Reembolso
curl -s -b /tmp/gastos.cookies -X POST \
  http://127.0.0.1:8100/api/transactions/<id>/refund
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Todo monto es `INTEGER` en centavos; prohibition de `REAL` en columnas monetarias (I-01) |
| Técnica | Conversión con aritmética entera (`rate_micro` × monto / 1.000.000) y redondeo half-up (I-02) |
| Técnica | Tasa congelada al registrar; nunca se recalcula (I-03); si cambia monto/moneda, se re-congela y se audita |
| Técnica | Acceso a SQLite solo vía `prepare()` con parámetros; prohibida la concatenación de SQL |
| Técnica | Transacciones atómicas con `BEGIN/COMMIT/ROLLBACK` en el Service |
| De negocio | Monto positivo (`amount_cents > 0`); el signo lo determina `kind` (I-08) |
| De negocio | La cuenta debe existir, pertenecer al espacio y estar activa |
| De negocio | La categoría debe existir, pertenecer al espacio, y su `kind` coincidir con el `kind` de la transacción |
| De negocio | Monedas soportadas: GTQ y USD; otras se rechazan |
| De negocio | La tasa se obtiene por cadena de resolución (SPEC-008); sin tasa válida se rechaza; nunca se inventa |
| De negocio | `transfer_group_id` siempre `NULL` (transferencias son SPEC-005) |
| De negocio | Fechas de negocio en `America/Guatemala`; marcas de tiempo en UTC ISO-8601 (I-09) |
| De seguridad | Toda mutación queda registrada en `audit_log` con `before_json`/`after_json` (I-11) |
| De seguridad | Solo el dueño autenticado puede crear, editar o archivar transacciones de su espacio |

## 9. Contratos

Los endpoints de transacciones están definidos en `docs/API.md` §6:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/transactions?from=&to=&accountId=&categoryId=&kind=` | lista paginada (`?limit=&offset=`) con `amountBaseCents` congelado |
| POST | `/api/transactions` | `{ kind, accountId, categoryId, amountCents, currency, occurredOn, description, notes? }` → crea con tasa congelada |
| PATCH | `/api/transactions/:id` | si cambia monto o moneda, re-congela tasa y audita; si solo cambia descripción/notas/categoría/fecha, no toca tasa |
| POST | `/api/transactions/:id/archive` | archivado lógico (`archived=1`) |
| POST | `/api/transactions/:id/refund` | genera la transacción inversa enlazada |

**Respuesta al crear** (incluye la conversión congelada):

```json
{
  "id": "…",
  "kind": "expense",
  "amountCents": 15000,
  "currency": "USD",
  "amountBaseCents": 115546,
  "fxRateMicro": 7703054,
  "rateDate": "2026-09-21",
  "rateSource": "er-api",
  "occurredOn": "2026-09-21",
  "description": "Suscripción",
  "notes": null,
  "categoryId": "…",
  "accountId": "…",
  "createdAt": "2026-09-21T12:00:00.000Z",
  "updatedAt": "2026-09-21T12:00:00.000Z"
}
```

**Forma de error** (consistente con `AGENT.md` §9.4):

```json
{
  "error": "La categoría no pertenece al tipo de transacción",
  "code": "CATEGORY_KIND_MISMATCH",
  "status": 422
}
```

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ✅ **Archivado lógico en vez de DELETE:** consistente con I-05 (`AGENT.md` §7) y las decisiones del proyecto. Endpoint `POST /api/transactions/:id/archive` en vez de `DELETE`. Aprobado por el dueño.
- ✅ **Re-congelación al editar monto/moneda:** `API.md` §6 lo documenta; alineado con I-03 (freeze al registrar). Al editar, se registra `before_json`/`after_json` en `audit_log`.
- ✅ **Reembolso aceptado:** endpoint `POST /api/transactions/:id/refund` definido en `API.md` §6. Genera transacción inversa enlazada.
- ✅ **`description` obligatoria, `notes` opcional:** alineado con el schema de `AGENT.md` §6 (`description` NOT NULL, `notes` nullable).
- ✅ **`transfer_group_id` siempre NULL:** las transferencias son SPEC-005; en SPEC-004 nunca se usa.
- ✅ **Cadena de resolución de tasa:** heredada de SPEC-008 §5.1; caché → primario → secundario → carry-forward → rechazo.
- ✅ **Carry-forward como estrategia, no como `source`:** alineado con SPEC-008 §5.1 y `AGENT.md` §6.1 (`CHECK IN ('er-api','banguat','manual')`).
- ✅ **Rate source grabado es siempre el origen real:** `er-api`, `banguat` o `manual`; nunca `carry-forward`.

## 12. Checklist antes de aprobar

```
[x] Problema entendido sin contexto adicional
[x] Objetivo binario falsable
[x] Contexto acotado (usuario real + escenario + límites)
[x] "Incluye" y "No incluye" no vacíos
[x] Comportamiento completo (principal + alternativos + límites)
[x] AC en Given/When/Then, binarios
[x] Ejemplos por flujo crítico
[x] Restricciones técnicas, de negocio y de seguridad
[x] Trazabilidad AC → test → código (pendiente de completar al implementar)
[x] Aprobación explícita del dueño (2026-09-21)
```

---

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de transacciones.*
