---
spec_id: SPEC-008
titulo: Tipos de cambio GTQ ⇄ USD
version: 0.2.0
estado: propuesta
fecha: 2026-09-20
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-003, SPEC-004, SPEC-010]
adrs: [ADR-003, ADR-004]
---

# SPEC-008 — Tipos de cambio GTQ ⇄ USD

> **Estado: 📝 propuesta** (2026-09-20) · Iteración de implementación: **ITER-002**

## 1. Problema

El sistema maneja dos monedas —GTQ y USD— pero no existe todavía un mecanismo determinado para obtener y aplicar el tipo de cambio en las transacciones que requieren conversión. Sin definir cómo se obtiene la tasa, cómo se congela al registrar y cómo se comporta cuando los proveedores fallan, no se puede implementar transacciones multimoneda de forma correcta ni auditable.

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño registra gastos en una cuenta personal; algunas transacciones pueden estar en USD, otras en GTQ. |
| Escenario | Registra una transacción en USD, el sistema selecciona una tasa; luego consulta el balance en GTQ. |
| Limitaciones | No hay API key de pago; el dueño quiere comodidad pero también trazabilidad de qué tasa se usó. |
| Riesgo principal | Inventar tasas o recalcular historial implica pérdida de integridad financiera. |

Esto se construye sobre ADR-003 y ADR-004 ya existentes, así como sobre el modelo de datos documentado en el proyecto. No se supone nada que ya esté decidido.

## 3. Objetivo (falsable)

> El sistema permite obtener, registrar y consultar el tipo de cambio GTQ↔USD y lo aplica a las transacciones que necesitan conversión, **sin inventar tasas y sin recalcular historial**.

**No se cumple si:**

- El sistema escribe una tasa que no proviene de un proveedor, override o carry-forward válido.
- El sistema recalcula una transacción histórica cuando cambia la tasa vigente.
- El usuario no puede saber qué tasa, fuente y fecha se usó en una transacción concreta.

## 4. Alcance

### 4.1 Incluye

- Obtención de tipo de cambio GTQ↔USD desde proveedores (primario y secundario) con comportamiento de fallo definido.
- Cómo se elige la tasa al registrar una transacción que requiere conversión.
- Congelación de la tasa usada en la transacción, con fecha, fuente y monto convertido congelados.
- Consulta de la tasa vigente y del historial de tasas registradas.
- Override manual de tasa por el dueño autenticado, con registro explícito de quien/fecha.
- Carry-forward como fuente válida cuando no hay proveedor ni override disponibles.

### 4.2 No incluye

- Reportes de meses pasados usando otra tasa distinta a la registrada (eso queda para reportes / SPEC-009, si se define).
- Conversión automática de transacciones ya registradas; el historial es inmutable.
- Más de dos monedas en esta iteración.
- Validación en tiempo real del XML de Banguat contra el servicio real; ese pendiente queda como tarea de implementación derivada de ADR-004.
- Interfaz de catálogo completo de tasas si no es necesaria para los flujos de registrar, consultar y override.

> Regla: ninguna de las dos listas puede quedar vacía. Si alguna fila queda vacía, la spec no está lista para aprobar.

## 5. Comportamiento

### 5.1 Flujo principal — obtener tasa para registro

1. El sistema necesita una tasa GTQ↔USD porque la transacción está en una moneda distinta a la base o se requiere conversión.
2. Intenta obtener tasa del proveedor primario configurado.
3. Si no responde o la respuesta no es válida, usa el secundario.
4. Si ambos no responden o no devuelven tasa válida, usa carry-forward si existe y es válido.
5. Si hay override manual vigente para la moneda/timeframe relevante, usa la override y no consulta proveedores para ese caso.
6. La tasa seleccionada se guarda junto a la transacción con fecha, fuente y monto convertido congelados.

### 5.2 Flujos alternativos

- **Primario sin respuesta** → pasa a secundario.
- **Secundario sin respuesta** → pasa a carry-forward.
- **Sin carry-forward válido** → rechaza la operación por falta de tasa; no registra con tasa inventada.
- **Override manual vigente** → usa la override y registra que la fuente fue override manual.
- **Tasa para moneda no soportada** → fuera de GTQ/USD se rechaza con mensaje claro; eso se deja para después.
- **Fecha de vigencia de override** → la override tiene fecha de vigencia; si no cubre el registro, se considera inválida para ese caso y se busca otra fuente.

### 5.3 Casos límite

- Proveedor devuelve tasa 0, negativa o no numérica → se descarta esa respuesta y se pasa a la siguiente opción o a la regla de fallo.
- La misma tasa puede consultarse varias veces; puede haber caché, pero la transacción guarda la tasa concreta usada, no una versión futura.
- El sistema no necesita una tasa para transacciones en la moneda base si no hay conversión; en ese caso no aplica.
- Si el dueño quiere ver qué tasa se aplicó, la transacción y/o catálogo de tasas lo dejan visible.
- Ejemplo: si la tasa que llega del proveedor es inválida, el sistema no registra la transacción con una tasa inventada.

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | Tasa primaria responde | proveedor primario disponible y responde tasa válida | el sistema necesita tasa para una transacción | usa la tasa del primario y la registra con su fuente y fecha |
| AC-02 | Falla primario, responde secundario | primario sin respuesta o con respuesta no válida, secundario responde tasa válida | el sistema necesita tasa | usa la tasa del secundario y la registra con su fuente y fecha |
| AC-03 | Ambos proveedores fallan, carry-forward disponible | no hay respuesta válida de proveedores y existe carry-forward válido | el sistema necesita tasa | usa la tasa de carry-forward y la registra con fuente carry-forward |
| AC-04 | Ambos proveedores fallan, no hay carry-forward | no hay respuesta válida de proveedores y no hay carry-forward disponible | el sistema necesita tasa | no registra la transacción con tasa inventada; da respuesta clara según regla elegida |
| AC-05 | Override manual vigente | el dueño tiene una override registrada para la moneda/timeframe relevante | el sistema necesita tasa | usa la override, registra que la fuente fue override manual y no consulta proveedores para ese caso |
| AC-06 | Transacción USD con conversión necesaria | se registra una transacción en USD y se necesita conversión a GTQ | se completa el registro | la transacción queda con amount_cents, currency, fx_rate_micro, amount_base_cents, rate_date, rate_source congelados |
| AC-07 | Historial inmutable | una transacción registrada tiene tasa y fuente congeladas | cambia la tasa vigente después | la transacción no cambia su tasa; si se quiere otra tasa, es un reporte o registro nuevo |
| AC-08 | Consulta de tasa vigente | existe al menos una tasa registrada o override vigente | se consulta tasa vigente para GTQ/USD | el sistema devuelve la tasa vigente, su fuente y fecha, o dice que no hay vigente según regla elegida |
| AC-09 | Tasa inválida por proveedor | un proveedor devuelve tasa 0 o negativa o no numérica | el sistema consulta tasa | la descarta y pasa a la siguiente opción o a la regla de fallo elegida |
| AC-10 | Tasa inválida por carry-forward | carry-forward registrado es 0 o negativo o no numérico | el sistema necesita tasa y llega a carry-forward | lo descarta y aplica la regla de fallo elegida |
| AC-11 | Transparencia de fuente | una transacción registrada con conversión | se consulta la transacción | se puede saber qué tasa, fuente y fecha se usaron |
| AC-12 | Override deshabilitado por fecha | la override registrada tiene fecha de vigencia que no cubre el registro | el sistema necesita tasa y llega a la override | la ignora por inválida para ese caso y continúa con proveedores/carry-forward |
| AC-13 | Rate source distinto para cada fuente | se registra una transacción usando proveedor primario, secundario, carry-forward o override | se consulta la transacción registrada | rate_source refleja correctamente qué fuente se usó |
| AC-14 | Tasa solo GTQ/USD | se intenta usar otra moneda distinta a GTQ o USD para conversión | el sistema intenta operar con esa moneda | se rechaza con mensaje claro; fuera de GTQ/USD se deja para después |
| AC-15 | Tasa de conversión consistente | se registra una transacción con conversión | se consulta la transacción | los campos de conversión son coherentes entre sí y con la tasa usada |

## 7. Ejemplos ejecutables

```bash
# 1. Consultar tasa vigente USD→GTQ
curl -s 'http://127.0.0.1:8100/api/rates?base=USD&quote=GTQ' | python -m json.tool

# 2. Registrar transacción en USD que requiere conversión
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"kind":"expense","accountId":"...","categoryId":"...","date":"2026-09-20","currency":"USD","amountCents":5000}' \
  http://127.0.0.1:8100/api/transactions

# resultado esperado: transacción con amountCents, currency, fxRateMicro,
# amountBaseCents, rateDate, rateSource congelados; sin recalcular nada después
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Dinero en centavos; sin `REAL`; sin recalcular tasas históricas; sin inventar tasa |
| De negocio | GTQ y USD en esta iteración; tasa solo de GTQ↔USD. La tasa primaria se expresa como `1 USD = X GTQ`; por eso el ejemplo muestra `fxRateMicro = 7703054` → `1 USD = 7.703054 GTQ` |
| De seguridad | Override manual solo la puede registrar el dueño autenticado; las rutas de tasas no exponen datos sensibles |
| De proveedores | Si no hay fuente válida, se aplica la regla de fallo elegida; carry-forward es fuente válida. Bravo: prueba AC-04. |
| De modelo | La tasa del proveedor se trata como cualquier otra: si es 0/negativa/no numérica, se descarta y se pasa a la siguiente opción o a la regla de fallo |
| De modelo | Cada transacción registra `rateSource` que identifica la fuente real usada: proveedor primario, secundario, carry-forward o override |

## 9. Contratos (si aplica)

Los contratos HTTP de tasas se formalizan en `docs/API.md` §10:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/rates?base=USD&quote=GTQ` | última tasa conocida + `rateDate` + `source` |
| POST | `/api/rates/refresh` | fuerza consulta a las fuentes (primaria → secundaria) |
| PUT | `/api/rates/manual` | fija una tasa manual para una fecha (`source = manual`) |

Respuesta de consulta vigente (ejemplo):

```json
{
  "base": "USD",
  "quote": "GTQ",
  "fxRateMicro": 7703054,
  "rateDate": "2026-09-20",
  "source": "er-api"
}
```

Respuesta de una transacción con conversión congelada (ejemplo):

```json
{
  "id": "…",
  "kind": "expense",
  "amountCents": 15000,
  "currency": "USD",
  "amountBaseCents": 115546,
  "fxRateMicro": 7703054,
  "rateDate": "2026-09-20",
  "rateSource": "er-api",
  "occurredOn": "2026-09-20"
}
```

## 10. Trazabilidad

PENDIENTE: tabla de AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ✅ **Regla de fallo elegida:** si ambos proveedores fallan y no hay carry-forward, el sistema rechaza la operación por falta de tasa; no registra con tasa inventada.
- ✅ **Carry-forward es fuente válida** y no se descarta solo por antigüedad en esta iteración.
- ✅ **Override manual:** registra la fecha de vigencia; si no cubre el registro, se ignora para ese caso.
- ✅ **Cada transacción registra `rateSource`** que identifica la fuente real usada.
- ✅ **Tasa solo GTQ/USD en esta iteración**; otras monedas se dejan para después.
- ✅ **La tasa del proveedor tiene el mismo tratamiento de validez:** si es 0/negativa/no numérica, se descarta.
- ✅ **Formato de tasa:** `1 USD = X GTQ`, expresado en micro unidades (`fxRateMicro`) para mantener precisión entera.
- ❓ ¿La override tiene fecha de vigencia explícita o permanece vigente hasta que se reemplaza? Se asume fecha de vigencia explícita.
- ❓ ¿Qué periodicidad de refresco tiene sentido en esta iteración, si es que se define alguna? Puede quedar para implementación.

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

*Spec derivada de la propuesta aprobada en sesión; sin contradecir ADR-003 y ADR-004.*
