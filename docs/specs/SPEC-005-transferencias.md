---
spec_id: SPEC-005
titulo: Transferencias entre cuentas
version: 1.0.0
estado: aprobada
fecha: 2026-09-21
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-004, SPEC-010]
adrs: [ADR-003, ADR-004, ADR-006]
---

# SPEC-005 — Transferencias entre cuentas

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-003

## 1. Problema

El dueño mueve dinero entre sus cuentas (por ejemplo, de la tarjeta de crédito en USD al efectivo en GTQ). Sin un mecanismo de transferencia, cada movimiento tendría que registrarse como ingreso en una cuenta y gasto en otra, distorsionando los totales. La transferencia es un movimiento interno que **no afecta gastos ni ingresos** y debe reflejarse como dos patas enlazadas con el mismo valor en moneda base.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño tiene varias cuentas (efectivo, débito, crédito) en GTQ y USD, y necesita mover dinero entre ellas |
| Escenario | Registra que transfirió $50 USD desde su cuenta de crédito a su efectivo en GTQ; el sistema aplica la tasa vigente y crea dos patas enlazadas |
| Limitaciones | La app se usa principalmente desde el móvil con prisa; el registro debe ser rápido |
| Riesgo principal | Que la transferencia influya en los totales de gastos/ingresos (I-04), o que las dos patas no cuadren en moneda base |

## 3. Objetivo (falsable)

> El sistema registra transferencias entre cuentas como dos patas enlazadas con `transfer_group_id`, sin que de ninguna suma a gastos e ingresos, y con el mismo valor en moneda base en ambas patas.

**No se cumple si:**

- Una transferencia aparece en los totales de gastos o ingresos.
- Las dos patas no tienen el mismo `amount_base_cents`.
- No se puede identificar que dos transacciones son patas de la misma transferencia.
- El sistema permite transferir a la misma cuenta.

## 4. Alcance

### 4.1 Incluye

- Transferencia entre dos cuentas distintas del mismo espacio.
- Misma moneda (GTQ → GTQ, USD → USD): monto idéntico en ambas patas.
- Monedas distintas (USD → GTQ): aplicación de tasa congelada al momento del registro (I-03, SPEC-008).
- Consulta de transferencias agrupadas por `transfer_group_id`.
- Borrado de una transferencia (elimina ambas patas en una sola transacción).
- Auditoría de creación y borrado en `audit_log` (I-11).

### 4.2 No incluye

- Transferencias a cuentas de otro espacio (I-07: aislamiento).
- Transferencias programadas automáticas (eso es SPEC-007, recurrentes).
- Reportes de movimientos por cuenta con saldo histórico (eso es SPEC-009).
- Edición de una sola pata de la transferencia (se borra y se crea otra); pendiente de regla.

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — crear transferencia

1. El dueño autenticado abre la pantalla de transferencia.
2. Selecciona cuenta de origen y destino (ambas del espacio, distintas entre sí), ingresa monto en la moneda de la cuenta de origen, y opcionalmente fecha y nota.
3. El sistema valida:
   - Ambas cuentas existen, pertenecen al espacio del dueño, y están activas (no archivadas).
   - Las cuentas no son la misma (I-07: aislamiento por espacio).
   - El monto es un entero positivo en centavos (`amount_cents > 0`, I-08).
4. Si las monedas son distintas, el sistema obtiene la tasa del día según SPEC-008 (cadena: caché → primario → secundario → carry-forward → rechazo si no hay tasa).
5. Se calcula `amount_base_cents` para ambas patas:
   - Pata origen: `amount_base_cents = round(amount_cents * rate_micro / 1_000_000)` (salida)
   - Pata destino: `amount_base_cents` debe ser **igual** a el de la pata origen (I-04: conserva el mismo valor en moneda base)
6. Se crean dos transacciones con `kind = 'transfer'`, `category_id = NULL`, mismo `transfer_group_id`, misma `rate_date` y `rate_source`.
7. `BEGIN → INSERT pata 1 + INSERT pata 2 + audit_log → COMMIT`.
8. Se devuelve la transferencia con ambas patas.

### 5.2 Flujos alternativos

- **Misma moneda (GTQ → GTQ)** → no se consulta tasa; `fx_rate_micro = NULL`, `rate_date = NULL`, `rate_source = NULL`; `amount_base_cents = amount_cents` en ambas patas.
- **Sin tasa disponible** → si las monedas son distintas y no hay tasa válida, se rechaza la operación con código `RATE_UNAVAILABLE` (no inventa tasa).
- **Cuenta inactiva o archivada** → rechazo con `422` / `ACCOUNT_ARCHIVED`.
- **Origen ≠ destino mismo espacio** → se valida y rechaza si son la misma cuenta.
- **Borrar transferencia** → elimina ambas patas en una sola transacción (`BEGIN → DELETE pata 1 + DELETE pata 2 + audit_log → COMMIT`).

### 5.3 Casos límite

- Transferencia GTQ → USD: el monto está en GTQ (origen), se convierte a USD (destino) con la tasa vigente.
- Transferencia USD → GTQ: el monto está en USD (origen), se convierte a GTQ (destino) con la tasa vigente.
- Ambas patas conservan el mismo `amount_base_cents` (ej. Q385.20 → Q385.20, o $50 → Q385.15 y Q385.15 respectivamente).
- La tasa del proveedor se trata como tasa válida: si es 0/negativa/no numérica, se descarta y se pasa al siguiente nivel (SPEC-008 §5.3).
- El `transfer_group_id` identifica unívocamente las dos patas de una transferencia.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Transferencia GTQ → GTQ | el dueño tiene una sesión válida, dos cuentas en GTQ activas | transfiere Q50.00 de una a otra | se crean dos patas con `kind=transfer`, `amountCents=5000`, `currency=GTQ`, `amountBaseCents=5000`, `transferGroupId` compartido |
| AC-02 | Transferencia USD → GTQ con conversión | el dueño tiene una cuenta en USD y otra en GTQ, tasa vigente 7.703054 | transfiere $50 desde USD a GTQ | pata origen: `amountCents=5000`, `currency=USD`, `amountBaseCents=38515`, `fxRateMicro=7703054`; pata destino: `amountCents=38515`, `currency=GTQ`, `amountBaseCents=38515`; ambas con el mismo `transferGroupId`, `rateDate` y `rateSource` |
| AC-03 | Transferencia no suma a gastos/ingresos | el dueño registró una transferencia | consulta los totales del mes | los gastos e ingresos no incluyen la transferencia (I-04) |
| AC-04 | Ambas patas conservan el mismo valor base | el dueño registra una transferencia | consulta ambas patas | `amountBaseCents` de la pata origen = `amountBaseCents` de la pata destino (I-04) |
| AC-05 | Rechazar transferencia a la misma cuenta | el dueño tiene una sesión válida y una sola cuenta | intenta transferir a la misma cuenta | el sistema rechaza con `422` y código `SAME_ACCOUNT` |
| AC-06 | Rechazar transferencia entre espacios | existe una cuenta del espacio B | el dueño intenta transferir a esa cuenta | el sistema rechaza con `404` (no filtra existencia, I-07) |
| AC-07 | Rechazar transferencia con monto cero | el dueño tiene sesión válida y dos cuentas | intenta transferir con `amountCents=0` | el sistema rechaza con `422` y código `INVALID_AMOUNT` (I-08) |
| AC-08 | Rechazar transferencia en cuenta inactiva | el dueño tiene una cuenta archivada | intenta transferir hacia/desde esa cuenta | el sistema rechaza con `422` y código `ACCOUNT_ARCHIVED` |
| AC-09 | Tasa congelada no cambia | una transferencia fue registrada con tasa X | la tasa vigente cambia después | la transferencia conserva la tasa X; `amountBaseCents` no se recalcula (I-03) |
| AC-10 | Sin tasa disponible para monedas distintas | el dueño tiene cuentas en USD y GTQ, pero no hay tasa (ni caché, ni proveedor, ni carry-forward, ni manual) | intenta transferir USD → GTQ | el sistema rechaza con `422` y código `RATE_UNAVAILABLE` |
| AC-11 | Consulta de transferencias | el doneño tiene varias transferencias | consulta `/api/transfers?from=&to=` | ve las transferencias agrupadas por `transferGroupId` |
| AC-12 | Borrar transferencia elimina ambas patas | el dueño tiene una transferencia | borra la transferencia por `groupId` | ambas patas son borradas en una sola transacción; la transferencia desaparece de la lista |
| AC-13 | Carry-forward conserva origen real | no hay respuesta de proveedores, carry-forward con `source=er-api` y `rate_date=2026-09-18` | registra una transferencia USD → GTQ | ambas patas conservan `rateSource=er-api` y `rateDate=2026-09-18` (no `carry-forward`) |
| AC-14 | category_id siempre NULL | el dueño registra una transferencia | consulta las patas de la transferencia | `categoryId` es `null` en ambas patas (transferencias no usan categorías) |
| AC-15 | Aislamiento por espacio | el dueño tiene transferencias en su espacio | consulta transferencias | solo ve las de su espacio (I-07) |

## 7. Ejemplos ejecutables

```bash
# 1. Crear transferencia GTQ → GTQ (misma moneda)
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"fromAccountId":"<id-gtq-1>","toAccountId":"<id-gtq-2>","amountCents":5000,"currency":"GTQ","occurredOn":"2026-09-21","note":"Pago"}' \
  http://127.0.0.1:8100/api/transfers

# 2. Crear transferencia USD → GTQ (con conversión)
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"fromAccountId":"<id-usd>","toAccountId":"<id-gtq>","amountCents":5000,"currency":"USD","occurredOn":"2026-09-21","note":"Remesa"}' \
  http://127.0.0.1:8100/api/transfers

# respuesta esperada (tasa 7.703054):
# { "transferGroupId":"<uuid>", "legs":[
#   { "id":"…", "kind":"transfer", "accountId":"<id-usd>", "amountCents":5000, "currency":"USD",
#     "amountBaseCents":38515, "fxRateMicro":7703054, "rateDate":"2026-09-21", "rateSource":"er-api",
#     "occurredOn":"2026-09-21", "categoryId":null, "description":null, "notes":"Remesa" },
#   { "id":"…", "kind":"transfer", "accountId":"<id-gtq>", "amountCents":38515, "currency":"GTQ",
#     "amountBaseCents":38515, "fxRateMicro":7703054, "rateDate":"2026-09-21", "rateSource":"er-api",
#     "occurredOn":"2026-09-21", "categoryId":null, "description":null, "notes":"Remesa" }
# ]}

# 3. Consultar transferencias
curl -s -b /tmp/gastos.cookies \
  'http://127.0.0.1:8100/api/transfers?from=2026-09-01&to=2026-09-30'

# 4. Borrar transferencia
curl -s -b /tmp/gastos.cookies -X DELETE \
  http://127.0.0.1:8100/api/transfers/<groupId>
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Dinero en centavos; sin `REAL`; aritmética entera con `rate_micro` y redondeo half-up (I-01, I-02) |
| Técnica | Tasa congelada al registrar; nunca se recalcula (I-03) |
| Técnica | Ambas patas se crean/borran en una sola transacción (`BEGIN/COMMIT/ROLLBACK`) |
| Técnica | SQL solo vía `prepare()` con parámetros; prohibida concatenación |
| De negocio | `kind = 'transfer'` en ambas patas; `category_id = NULL` |
| De negocio | Ambas patas conservan el mismo `amount_base_cents` (I-04) |
| De negocio | Las cuentas deben ser distintas, pertenecer al espacio y estar activas |
| De negocio | Sin tasa válida para monedas distintas → rechazo (`RATE_UNAVAILABLE`) |
| De negocio | `transfer_group_id` identifica unívocamente las dos patas |
| De seguridad | Toda mutación queda registrada en `audit_log` (I-11) |
| De seguridad | Solo el dueño autenticado puede crear/borrar transferencias de su espacio |

## 9. Contratos

Los endpoints de transferencias están definidos en `docs/API.md` §7:

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/transfers` | `{ fromAccountId, toAccountId, amountCents, currency, occurredOn?, note? }` → crea dos patas con el mismo `transferGroupId` |
| GET | `/api/transfers?from=&to=` | agrupadas por `transferGroupId` |
| DELETE | `/api/transfers/:groupId` | elimina las dos patas en una sola transacción |

**Respuesta al crear** (ejemplo):

```json
{
  "transferGroupId": "…",
  "legs": [
    {
      "id": "…",
      "kind": "transfer",
      "accountId": "…",
      "amountCents": 5000,
      "currency": "USD",
      "amountBaseCents": 38515,
      "fxRateMicro": 7703054,
      "rateDate": "2026-09-21",
      "rateSource": "er-api",
      "occurredOn": "2026-09-21",
      "categoryId": null,
      "notes": "Remesa"
    },
    {
      "id": "…",
      "kind": "transfer",
      "accountId": "…",
      "amountCents": 38515,
      "currency": "GTQ",
      "amountBaseCents": 38515,
      "fxRateMicro": 7703054,
      "rateDate": "2026-09-21",
      "rateSource": "er-api",
      "occurredOn": "2026-09-21",
      "categoryId": null,
      "notes": "Remesa"
    }
  ]
}
```

## 10. Trazabilidad

| AC | Test | Archivo de código |
|----|------|-------------------|
| AC-01 | `transferGtqToGtq` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-02 | `transferUsdToGtqConverts` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-03 | `transferDoesNotSumToExpenseIncome` | `server/repositories/TransactionRepository.js` (`sumByCategory`) |
| AC-04 | `bothLegsShareAmountBase` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-05 | `rejectSameAccount` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-06 | `rejectOtherSpaceAccount` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-07 | `rejectZeroAmount` | `server/services/TransactionService.js` (`validateAmount`) |
| AC-08 | `rejectArchivedAccount` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-09 | `frozenRateDoesNotChange` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-10 | `rejectRateUnavailable` | `server/services/RateService.js` (`requireRate`) |
| AC-11 | `listTransfersGrouped` | `server/routes/transfers.js` + `TransactionRepository.listTransfers` |
| AC-12 | `deleteTransferRemovesBothLegs` | `server/services/TransactionService.js` (`deleteTransfer`) |
| AC-13 | `carryForwardKeepsRealSource` | `server/services/RateService.js` (`resolve`) |
| AC-14 | `categoryIdAlwaysNull` | `server/services/TransactionService.js` (`createTransfer`) |
| AC-15 | `isolationBySpace` | `server/routes/transfers.js` (`requireAuth`/`currentSpace`) |

Todos los tests viven en `tests/integration/transfers.test.js` (15/15 en verde, medida 2026-09-22).

**Corrección de spec (2026-09-22):** AC-02 y los ejemplos §7/§9 escribían `amountBaseCents=385153`;
la fórmula §5.1 (half-up de `5000 × 7.703054`) y el ejemplo §5.3 ("$50 → Q385.15") dan **38515**.
Se corrigió la spec a 38515; el test siempre verificó la matemática correcta.

## 11. Notas y decisiones

- ✅ **Tasa solo para monedas distintas:** si ambas cuentas tienen la misma moneda, no se consulta tasa.
- ✅ **Carry-forward conserva origen real:** alineado con SPEC-008 §5.1; `rate_source` refleja el origen real (`er-api`/`banguat`/`manual`), nunca `carry-forward`.
- ✅ **`kind = 'transfer'` y `category_id = NULL`:** consistente con schema de `AGENT.md` §6.1.
- ✅ **Borrado físico de ambas patas:** `API.md` §7 define `DELETE /api/transfers/:groupId`. I-05 ("nada con movimientos se borra: se archiva") aplica a cuentas y categorías, no a transacciones individuales. Las transferencias se borran físicamente en una sola transacción.
- ✅ **Monto en moneda de origen:** el `amountCents` y `currency` del request se refieren a la cuenta de origen; la pata destino se calcula con la tasa.
- ✅ **Redondeo half-up en la conversión:** `amountBaseCents = round(amountCents * rate_micro / 1_000_000)`, coherente con I-02.

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
[x] Trazabilidad AC → test → código (completada al implementar, §10)
[x] Aprobación explícita del dueño (2026-09-21)
```

---

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de transferencias.*
