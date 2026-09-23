---
spec_id: SPEC-002
titulo: Cuentas (efectivo, débito, crédito)
version: 1.0.0
estado: aprobada
fecha: 2026-09-20
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-004, SPEC-010]
adrs: [ADR-006]
---

# SPEC-002 — Cuentas (efectivo, débito, crédito)

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-002

## 1. Problema

El sistema necesita un lugar donde registrar los saldos de los bienes del dueño: cuentas reales (efectivo, cuenta bancaria débito, crédito) con sus monedas y sus movimientos. Sin un catálogo de cuentas, no se puede registrar una transacción ni consultar balances.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño tiene una o varias cuentas reales (efectivo, banco débito, tarjeta de crédito) y registra gastos e ingresos en ellas. |
| Escenario | El dueño registra una cuenta bancaria en GTQ, una tarjeta de crédito en USD, y luego registra movimientos en ellas. |
| Limitaciones | No se implementa el multiusuario en esta iteración; hay un solo espacio de trabajo del dueño. |
| Riesgo principal | Que las cuentas se modelen sin moneda, sin saldo o sin separar débito/crédito, lo que entorpece transacciones y reportes. |

Nota: este documento se basa en el estilo de ADR y en la estructura de datos que ya figuran en el proyecto; no se inventa comportamiento que ya esté decidido.

## 3. Objetivo (falsable)

> El sistema permite registrar cuentas con nombre, tipo, moneda, saldo inicial y estado activo, y permite consultar las cuentas del espacio.

**No se cumple si:**

- El sistema no registra el tipo de cuenta (efectivo/débito/crédito).
- El sistema no registra la moneda de la cuenta.
- El sistema no distingue cuenta activa de inactiva.
- El sistema permite transacciones en una cuenta que no existe o que no pertenece al espacio.

## 4. Alcance

### 4.1 Incluye

- Tipos de cuenta: efectivo, débito, crédito.
- Moneda de la cuenta (GTQ o USD en esta iteración; otras monedas se dejan para después).
- Estado de la cuenta: activa/inactiva.
- Saldo inicial opcional al crear la cuenta.
- Consulta de cuentas del espacio con filtros básicos.
- Auditoría de creación y modificación de cuentas.

### 4.2 No incluye

- Transacciones en sí mismas (eso es SPEC-004).
- Reportes con balances históricos por período (eso es SPEC-009, si se define).
- Cuentas compartidas con otro usuario (esto es multiusuario y se deja para después).
- Worflow financiero avanzado como límites de crédito o alertas (fuera de alcance por ahora).

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — crear cuenta

1. El dueño autenticado abre la sección de cuentas.
2. Ingresa nombre, tipo y moneda; puede ingresar saldo inicial opcional.
3. El sistema valida los datos y guarda la cuenta con el espacio del dueño.
4. Si se ingresa saldo inicial, se registra como saldo inicial de la cuenta.
5. La cuenta queda lista para recibir transacciones.

### 5.2 Flujos alternativos

- **Cuenta con saldo inicial negativo** → se permite solo para crédito, no para efectivo ni débito.
- **Cuenta duplicada** → si el nombre y la moneda ya existen para el espacio, pide confirmación.
- **Moneda no soportada** → se rechaza la creación con mensaje claro.
- **Cuenta inactiva** → cuando el dueño desactiva una cuenta, esta no puede recibir nuevas transacciones.

### 5.3 Casos límite

- La moneda de la cuenta puede ser distinta a la moneda base del usuario.
- El saldo inicial puede ser cero.
- La cuenta puede tener transacciones pendientes cuando se desactiva; la desactivación no borra el historial.
- La cuenta no puede eliminarse si tiene transacciones asociadas.

## 6. Criterios de aceptación

| ID | Escenario | Dado | Cuando | Entonces |
|----|-----------|------|--------|----------|
| AC-01 | Crear cuenta efectivo en GTQ | el dueño tiene una sesión válida | crea una cuenta con nombre, tipo efectivo, moneda GTQ | la cuenta queda registrada con esos datos y con espacio del dueño |
| AC-02 | Crear cuenta débito en USD | el dueño tiene sesión válida | crea una cuenta con nombre, tipo débito, moneda USD | la cuenta queda registrada en USD con el espacio del dueño |
| AC-03 | Crear cuenta crédito con saldo inicial negativo | el dueño tiene sesión válida | crea una cuenta crédito con saldo inicial negativo | la cuenta queda registrada y acepta saldo negativo |
| AC-04 | Rechazar saldo inicial negativo en efectivo | el dueño tiene sesión válida | intenta crear efectivo con saldo negativo | el sistema rechaza la operación con mensaje claro |
| AC-05 | Consultar cuentas del espacio | el dueño tiene cuenta y sesión válida | consulta las cuentas de su espacio | el sistema devuelve la lista de cuentas con sus datos |
| AC-06 | Desactivar cuenta | el dueño tiene una cuenta activa | desactiva la cuenta | la cuenta queda inactiva y no puede recibir nuevas transacciones |
| AC-07 | Imposibilidad de eliminar cuenta con transacciones | el dueño tiene una cuenta con transacciones asociadas | intenta eliminar la cuenta | el sistema rechaza la eliminación |
| AC-08 | Moneda no soportada | el dueño tiene sesión válida | intenta crear una cuenta con moneda distinta a GTQ o USD | el sistema rechaza la operación |
| AC-09 | Transacción en cuenta que no existe | el dueño tiene sesión válida | intenta registrar transacción en una cuenta inexistente | el sistema rechaza la operación |
| AC-10 | Transacción en cuenta inactiva | el dueño tiene una cuenta inactiva | intenta registrar transacción en esa cuenta | el sistema rechaza la operación |

## 7. Ejemplos ejecutables

```bash
# 1. Listar cuentas del espacio
curl -s -b /tmp/gastos.cookies http://127.0.0.1:8100/api/accounts

# 2. Crear cuenta efectivo en GTQ
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"name":"Efectivo GTQ","type":"cash","currency":"GTQ","balanceInitialCents":50000}' \
  http://127.0.0.1:8100/api/accounts

# 3. Crear cuenta crédito con saldo inicial negativo
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"name":"Tarjeta crédito USD","type":"credit","currency":"USD","balanceInitialCents":-20000}' \
  http://127.0.0.1:8100/api/accounts
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Los saldos se manejan en centavos; sin `REAL`; transacciones atómicas. |
| De negocio | Tipos de cuenta: efectivo, débito, crédito. |
| De negocio | La cuenta pertenece a un solo espacio (el del dueño, en esta iteración). |
| De negocio | La cuenta tiene moneda propia (GTQ o USD en esta iteración). |
| De negocio | No se borra cuenta con transacciones asociadas. |

## 9. Contratos

Los endpoints de cuentas están definidos en `docs/API.md` §4:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/accounts` | incluye saldo calculado (no almacenado) |
| POST | `/api/accounts` | `{ name, type, currency, openingBalanceCents }` |
| GET/PATCH | `/api/accounts/:id` | `PATCH` no permite cambiar `currency` si hay movimientos |
| POST | `/api/accounts/:id/archive` | borrado lógico (I-05) |

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ✅ **Schema de `accounts` alineado a AGENT.md §6.1 (canónico):** `accounts(id PK, space_id FK spaces, name, type CHECK IN ('cash','debit','credit'), currency CHECK IN ('GTQ','USD'), opening_balance_cents INTEGER NOT NULL DEFAULT 0, archived INTEGER DEFAULT 0, created_at, updated_at)`. Se resuelve la discrepancia: `active` → `archived` (I-05 bajas lógicas) y `balance_initial_cents` → `opening_balance_cents` (coherente con API.md §4 `openingBalanceCents`). La spec queda en `propuesta` hasta que se marque el checklist §12.
- ✅ **Límite de cuentas por tipo/espacio:** sin límite numérico en esta iteración (aprobado por el dueño). El modelo `space_id` (ADR-006) ya aísla por espacio; el dueño es uno solo.
- ✅ **Unicidad de nombre:** `AGENT.md` §6.1 no define `UNIQUE(space_id, name)` sobre `accounts`. Se resuelve: la unicidad se aplica a nivel de aplicación (409 si ya existe cuenta con mismo nombre y moneda en el espacio), no a nivel de BD. Coherente con el comportamiento §5.2 "pide confirmación" y con `categories` que sí tiene UNIQUE a nivel de BD. El campo `opening_balance_cents` se alinea con `API.md` §4 (`openingBalanceCents`). Decisión cerrada.
- ✅ **Monedas soportadas:** solo GTQ y USD en esta iteración, alineado al canónico (`AGENT.md` §6.1 `CHECK IN ('GTQ','USD')` y decisión 8). Cierra la decisión abierta: no se introducen más monedas (ADR-004 no cubre otras).
- ✅ **Saldo inicial vs saldo transitorio en UI:** se muestra el saldo inicial (`opening_balance_cents`) como "Saldo inicial" en la edición/configuración de la cuenta, y el saldo transitorio (calculado: `opening_balance_cents + Σ movimientos`, no almacenado) como "Saldo actual" en el listado y detalle. Coherente con `API.md` §4 ("saldo calculado no almacenado") y el objetivo §2.3 de totales exactos al centavo. Cierra la decisión abierta.

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

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de cuentas.*
