# CONTEXT.md — Gastos

Contexto de dominio y convenciones del proyecto. El **contrato operativo** es
[`../AGENT.md`](../AGENT.md); la arquitectura, [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
Este documento **no duplica** el esquema de datos ni el protocolo de contexto: los referencia.

---

## 1. Dominio y glosario

| Término | Significado en este proyecto |
|---|---|
| **Espacio** (`space`) | contenedor de todos los datos de una persona. Hoy hay uno solo, pero el modelo soporta varios. |
| **Cuenta** (`account`) | dónde está el dinero: efectivo, débito o crédito. Tiene moneda y saldo inicial. |
| **Categoría** (`category`) | clasificación del gasto o ingreso, con jerarquía de un nivel (padre → hijo). |
| **Transacción** | movimiento con monto positivo y tipo: `expense`, `income` o `transfer`. |
| **Transferencia** | par de transacciones enlazadas entre cuentas; **no** es gasto ni ingreso. |
| **Moneda base** | GTQ por defecto; la moneda en la que se expresan los reportes. |
| **Monto base** (`amount_base_cents`) | monto original convertido a moneda base con la tasa **congelada** al registrar. |
| **rate_micro** | tasa × 1.000.000, guardada como entero para evitar coma flotante. |
| **rate_source** | de dónde salió la tasa usada: `base`, `er-api`, `banguat` o `manual`. |
| **Presupuesto** | límite mensual por categoría, expresado en moneda base. |
| **Recurrente** | regla que genera transacciones periódicas (una sola vez por período). |
| **Carry-forward** | usar la última tasa conocida cuando ninguna fuente responde, conservando su fecha real. |
| **Checkpoint** | documento de continuidad para retomar el trabajo sin perder contexto (ver `AGENT.md` §13). |

## 2. Reglas de negocio

Las **invariantes** (I-01…I-12) y su verificación están en **`AGENT.md` §7** — son la fuente única.
Resumen operativo:

- El dinero se maneja **solo en centavos enteros**; nunca coma flotante.
- La conversión se **congela** al registrar; los reportes históricos **no** cambian.
- Las transferencias **no** alteran los totales de gastos e ingresos.
- Nada con movimientos se borra: se **archiva**.
- Los recurrentes son **idempotentes** por período.
- Toda consulta filtra por `space_id` (aislamiento).

## 3. Decisiones de dominio

| Fecha | Decisión | Motivo |
|---|---|---|
| 2026-09-20 | Un solo espacio, pero con `space_id` en todo | evitar una migración destructiva si se comparte |
| 2026-09-20 | GTQ como moneda base, USD soportado | uso real en Guatemala con compras en dólares |
| 2026-09-20 | Cotización congelada por transacción | contabilidad histórica estable (ADR-003) |
| 2026-09-20 | Montos siempre positivos, el tipo da el signo | evita el error clásico de signos inconsistentes |
| 2026-09-20 | Transferencias con par de patas enlazadas | el saldo se mueve sin inflar los totales |
| 2026-09-20 | Meses cerrados inmutables queda para fase 2 | no inflar el MVP |

## 4. Módulos del MVP

| Módulo | Spec | Responsabilidad |
|---|---|---|
| Autenticación | SPEC-001 | sesión del dueño; única puerta de entrada |
| Cuentas | SPEC-002 | efectivo/débito/crédito, saldo inicial, archivar |
| Categorías | SPEC-003 | clasificación de gastos e ingresos |
| Transacciones | SPEC-004 | el núcleo: registrar y editar movimientos |
| Transferencias | SPEC-005 | mover dinero entre cuentas sin distorsionar totales |
| Presupuestos | SPEC-006 | límites mensuales por categoría y alerta de exceso |
| Recurrentes | SPEC-007 | gastos/ingresos periódicos idempotentes |
| Tipos de cambio | SPEC-008 | obtener, cachear y congelar la tasa GTQ/USD |
| Reportes | SPEC-009 | total del mes, por categoría y por cuenta |
| Despliegue | SPEC-010 | publicar con systemd + nginx `/gastos/` |

## 5. Utilidades compartidas

| Utilidad | Ubicación | Uso |
|---|---|---|
| `money.js` | `server/utils/` | centavos, formato (`Intl.NumberFormat`) y redondeo half-up |
| `fx.js` | `server/utils/` | conversión entera con `rate_micro` |
| `errors.js` | `server/utils/` | `AppError` y derivados (`401/403/404/409/422`) |
| `http.js` | `server/utils/` | `sendJson`, `readJsonBody`, cookies, headers de seguridad |
| `logger.js` | `server/utils/` | logs **sin datos del usuario** |
| `rateLimiter.js` | `server/utils/` | límite de intentos de login |
| `PasswordService.js` | `src/services/` | PBKDF2-SHA512 (compartido servidor/cliente, reutilizado de proyectos previos) |
| `ApiClient.js` | `src/services/` | `fetch` con rutas **relativas** (§10.3 del AGENT.md) |

## 6. Roles y permisos (RBAC)

Hoy existe **un solo rol efectivo**: `owner` del espacio. La tabla `space_members` ya contempla
`owner`, `editor` y `viewer`, pero **la UI de permisos no se implementa en el MVP**.
Regla vigente: toda ruta de negocio exige `requireAuth` **y** `requireSpace` (pertenencia al espacio).

## 7. Convenciones

Ver `AGENT.md` §12 (idioma, nombres, estilo, commits, formatos). Puntos que se equivocan más seguido:

- **Identificadores en inglés**, **UI y documentos en español**.
- Endpoints en plural kebab: `/api/transactions`, `/api/transfer-group`… no; se usa `/api/transfers`.
- Dinero en UI con `es-GT`; fechas `dd/MM/yyyy` en UI y `YYYY-MM-DD` en API/BD.

## 8. Patrones que funcionan acá

1. **Probar antes de tocar dinero**: escribir el caso de cuadre (suma por categoría = total del mes) antes del cambio.
2. **Medir antes de afirmar**: puertos, servicios y tasas se consultan, no se recuerdan (P-06).
3. **Un dato, un dueño**: `CHECKPOINT.md` (proyecto) y `docs/Context_live.md` (infraestructura).
4. **Cambios aditivos en nginx**: nunca reescribir el vhost; agregar `location` y verificar Química.

## 9. Supuestos vigentes

- Un único usuario real y una única máquina de despliegue (sin alta disponibilidad).
- La URL pública es alcanzable por cualquiera que la conozca → la autenticación es obligatoria.
- El uso principal es móvil, con prisa y en el momento del gasto.

## 10. Fixes recientes

*(Formato obligatorio: **Fix — Causa — Prevención**.)*

- **Fix:** contraste entre `CHECKPOINT.md` y `docs/Context_live.md` resuelto por diseño de propiedad única.
**Causa:** en `~/Config-System` el generador pisa las notas manuales con texto hardcodeado y el archivo
se edita a mano, quedando desincronizado de su propio script. **Prevención:** marcadores
`<!-- BEGIN GENERADO -->` / `<!-- END GENERADO -->` + `npm run check:docs` (regla 5 y 7 del contrato).

## 11. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación: dominio, glosario, reglas, módulos, RBAC y patrones. |
