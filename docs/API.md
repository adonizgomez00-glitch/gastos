# API.md — Gastos

**Estado:** diseño (contrato). La implementación llega con las specs correspondientes.
**Base (según despliegue):** `/gastos/api/...` público → `/api/...` para la app.
Todas las rutas responden JSON. Errores con la forma única `{ error, code, status }`.

---

## 1. Convenciones

| Aspecto | Regla |
|---|---|
| Autenticación | cookie `gastos_session` (`HttpOnly`, `Secure`, `SameSite=Lax`) |
| Aislamiento | toda ruta de negocio resuelve el `space_id` de la sesión (nunca se acepta del cliente) |
| Fechas | negocio `YYYY-MM-DD`; marcas ISO-8601 UTC |
| Dinero | enteros en **centavos** (`amount_cents`, `amount_base_cents`) |
| Paginación | `?limit=` (máx. 200) y `?offset=` |
| Idempotencia | obligatoria en la generación de recurrentes (`UNIQUE(rule_id, period_key)`) |
| Errores | `401` sin sesión · `403` sin permiso · `404` inexistente o de otro espacio · `409` conflicto · `422` validación · `429` rate limit |

## 2. Salud

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok", "db": "up", "rates": "ok\|stale\|missing" }` |

Sin autenticación; **no** expone datos del usuario.

## 3. Autenticación (SPEC-001)

| Método | Ruta | Cuerpo / Notas |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → cookie de sesión; rate limit 5/15 min |
| POST | `/api/auth/logout` | invalida el token en la BD |
| GET | `/api/auth/me` | `{ id, email, name, baseCurrency, timezone }` |

## 4. Cuentas (SPEC-002)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/accounts` | incluye saldo calculado (no almacenado) |
| POST | `/api/accounts` | `{ name, type, currency, openingBalanceCents }` |
| GET/PATCH | `/api/accounts/:id` | `PATCH` no permite cambiar `currency` si hay movimientos |
| POST | `/api/accounts/:id/archive` | borrado lógico (I-05) |

## 5. Categorías (SPEC-003)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/categories?kind=expense\|income` | árbol de un nivel |
| POST | `/api/categories` | `{ name, kind, parentId?, color?, icon? }` |
| PATCH | `/api/categories/:id` | renombrar, recolorear, mover de padre |
| POST | `/api/categories/:id/archive` | prohibido si tiene movimientos (I-05) |

## 6. Transacciones (SPEC-004)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/transactions?from=&to=&accountId=&categoryId=&kind=` | lista paginada |
| POST | `/api/transactions` | `{ kind, accountId, categoryId, amountCents, currency, occurredOn, description?, notes? }` |
| PATCH | `/api/transactions/:id` | si cambia el monto o la moneda, la tasa se vuelve a congelar (nueva versión auditada) |
| DELETE | `/api/transactions/:id` | borrado real permitido (no tiene derivados) |
| POST | `/api/transactions/:id/refund` | genera la transacción inversa enlazada |

**Respuesta al crear** (incluye la conversión congelada):

```json
{
  "id": "…", "kind": "expense", "amountCents": 15000, "currency": "USD",
  "amountBaseCents": 115546, "fxRateMicro": 7703054, "rateDate": "2026-09-20",
  "rateSource": "er-api", "occurredOn": "2026-09-20"
}
```

## 7. Transferencias (SPEC-005)

| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/transfers` | `{ fromAccountId, toAccountId, amountMinor, currency, occurredOn?, note? }` → crea dos patas con el mismo `transferGroupId` |
| GET | `/api/transfers?from=&to=` | agrupadas por `transferGroupId` |
| DELETE | `/api/transfers/:groupId` | elimina las dos patas en una sola transacción |

## 8. Presupuestos (SPEC-006)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/budgets?year=&month=` | incluye consumido y porcentaje |
| PUT | `/api/budgets` | upsert por `(categoryId, year, month)` |
| DELETE | `/api/budgets/:id` | — |

## 9. Recurrentes (SPEC-007)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/recurring` | reglas con `nextRunOn` |
| POST | `/api/recurring` | `{ kind, accountId, categoryId, amountCents, currency, frequency, dayOfMonth?, startOn }` |
| PATCH | `/api/recurring/:id` | pausar/editar (no reescribe transacciones pasadas) |
| POST | `/api/recurring/run` | genera lo pendiente; **idempotente** (I-06) |

## 10. Tipos de cambio (SPEC-008)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/rates?base=USD&quote=GTQ` | última tasa conocida + `rateDate` + `source` |
| POST | `/api/rates/refresh` | fuerza consulta a las fuentes (primaria → secundaria) |
| PUT | `/api/rates/manual` | fija una tasa manual para una fecha (`source = manual`) |

## 11. Reportes (SPEC-009)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/reports/summary?year=&month=` | total de gastos, ingresos y balance en moneda base |
| GET | `/api/reports/by-category?year=&month=` | incluye presupuesto vs real |
| GET | `/api/reports/by-account?year=&month=` | saldos y movimientos |
| GET | `/api/reports/compare?year=&month=` | mes actual vs anterior |

**Regla de oro de los reportes:** las transferencias **nunca** suman a gastos ni ingresos (I-04),
y todo total sale de `amount_base_cents` (congelado, I-03).
