---
spec_id: SPEC-002
titulo: Cuentas (efectivo, débito, crédito)
version: 0.1.0
estado: propuesta
fecha: 2026-09-20
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-004, SPEC-010]
adrs: []
---

# SPEC-002 — Cuentas (efectivo, débito, crédito)

> Estado: propuesta · Iteración de implementación: ITER-002

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

## 9. Contratos (si aplica)

PENDIENTE: contratos HTTP de cuentas se formalizan en `docs/API.md` cuando la spec se aprueba; se deja claro que las cuentas se relacionan con espacios y que las transacciones dependen de ellas.

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ❓ ¿Cuál es el Schema exacto de la tabla `accounts`? Se sugiere: `id, space_id, name, type, currency, active, balance_initial_cents, created_at, updated_at`.
- ❓ ¿Cuántas cuentas de cada tipo puede tener el dueño? Se asume sin límite en esta iteración.
- ❓ ¿Qué monedas soporta la cuenta aparte de GTQ/USD en esta iteración? Por ahora solo GTQ y USD.
- ❓ ¿Se muestra el saldo inicial en la UI y cómo se diferencia de saldo transitorio? Pendiente de decisión.

## 12. Checklist antes de aprobar

```
[ ] Problema entendido sin contexto adicional
[ ] Objetivo binario falsable
[ ] Contexto acotado
[ ] "Incluye" y "No incluye" no vacíos
[ ] Comportamiento completo (principal + alternativos + límites)
[ ] AC en Given/When/Then, binarios
[ ] Ejemplos por flujo crítico
[ ] Restricciones técnicas, de negocio y de seguridad
[ ] Trazabilidad AC → test → código (o plan de cuando se completa)
[ ] Aprobación explícita del dueño
```

---

*Este documento es una propuesta para revisión; no contradice los documentos existentes del proyecto hasta que se apruebe.*
