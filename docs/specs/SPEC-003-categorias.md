---
spec_id: SPEC-003
titulo: Categorías (gasto/ingreso, jerárquicas)
version: 1.0.0
estado: aprobada
fecha: 2026-09-20
fecha_aprobacion: 2026-09-21
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-004, SPEC-006, SPEC-010]
adrs: [ADR-006]
---

# SPEC-003 — Categorías (gasto/ingreso, jerárquicas)

> **Estado: ✅ aprobada** (2026-09-21) · Iteración de implementación: ITER-002

## 1. Problema

El sistema necesita un catálogo de categorías para clasificar ingresos y gastos y poder reportar por categoría después. Sin categorías, no hay forma de organizar las transacciones ni de hacer presupuestos por categoría (que entra con SPEC-006).

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño quiere clasificar sus movimientos en categorías familiares: Comida, Transporte, Sueldo, etc. |
| Escenario | El dueño registra categorías, puede usarlas en transacciones y luego consulta totales por categoría. |
| Limitaciones | No se implementa multiusuario en esta iteración; hay un solo espacio de trabajo del dueño. |
| Riesgo principal | Que las categorías queden planas, o que no se pueda distinguir gasto de ingreso, o que no se pueda reusar una categoría en presupuestos. |

Este documento se basa en el estilo de ADR y en la estructura de datos que ya figuran en el proyecto; no se inventa comportamiento que ya esté decidido.

## 3. Objetivo (falsable)

> El sistema permite crear, editar y eliminar categorías con nombre, tipo (gasto o ingreso), jerarquía opcional y cualquier otra propiedad necesaria; las categorías se rectifican en transacciones y en presupuestos.

**No se cumple si:**

- El sistema no distingue gasto de ingreso a nivel de categoría.
- El sistema no permite jerarquía cuando la catégorie lo requiere.
- El sistema permite usar una categoría eliminada en transacciones nuevas.
- El sistema permite crear dos categorías con el mismo nombre, mismo tipo y misma jerarquía en el mismo espacio.

## 4. Alcance

### 4.1 Incluye

- Tipos de categoría: gasto, ingreso.
- Jerarquía opcional dentro del espacio.
- Consulta de categorías del espacio con filtros básicos.
- Reusabilidad en transacciones y presupuestos (esa parte se formaliza en SPEC-004 y SPEC-006).
- Auditoría de creación y modificación.

### 4.2 No incluye

- Transacciones en sí mismas (eso es SPEC-004).
- Presupuestos en sí mismos (eso es SPEC-006).
- Reportes de balances por categoría (eso es SPEC-009, si se define).
- Categorías compartidas entre espacios (multiusuario, fuera de alcance por ahora).

> Regla: ninguna lista puede quedar vacía.

## 5. Comportamiento

### 5.1 Flujo principal — crear categoría

1. El dueño autenticado abre la sección de categorías.
2. Ingresa nombre, tipo (gasto o ingreso), puede elegir padre si quiere jerarquía.
3. El sistema valida los datos y guarda la categoría con el espacio del dueño.
4. La categoría queda lista para ser usada en transacciones y presupuestos.

### 5.2 Flujos alternativos

- **Categoría con mismo nombre, mismo tipo y mismo padre** → el sistema rechaza o pide confirmación.
- **Padre inválido** → si la categoría padre no existe o no pertenece al espacio, se rechaza.
- **Categoría de tipo gasto pero con movimientos de ingreso asociados** → se rechaza la edición que rompería coherencia, o se permite con aviso.
- **Eliminar categoría usada en transacciones** → se rechaza la eliminación directa; se deja para una acción de reasignación o exclusión.

### 5.3 Casos límite

- La jerarquía puede tener un nivel de profundidad pequeño y acotado en esta iteración; se deja explícito si hay límite.
- El nombre puede tener duplicados si difieren en tipo o padre.
- La categoría puede existir sin transacciones y sin presupuestos asociados.
- Una categoría no puede eliminarse si está usada en transacciones; depende de la regla elegida.

## 6. Criterios de aceptación

| ID | Escenario | Dado | Cuando | Entonces |
|----|-----------|------|--------|----------|
| AC-01 | Crear categoría de gasto sin jerarquía | el dueño tiene sesión válida | crea una categoría con nombre y tipo gasto | la categoría queda guardada con el espacio del dueño |
| AC-02 | Crear categoría de ingreso sin jerarquía | el dueño tiene sesión válida | crea una categoría con nombre y tipo ingreso | la categoría queda guardada con el espacio del dueño |
| AC-03 | Crear categoría con jerarquía | el dueño tiene sesión válida y tiene una categoría padre válida | crea una categoría con padre válido | la categoría queda guardada bajo ese padre |
| AC-04 | Rechazar categoría duplicada exacta | el dueño tiene una categoría con mismo nombre, mismo tipo y mismo padre | intenta crear otra idéntica | el sistema rechaza la creación |
| AC-05 | Consultar categorías del espacio | el dueño tiene categorías y sesión válida | consulta las categorías de su espacio | el sistema devuelve la lista con sus datos |
| AC-06 | Editar categoría sin cambiar tipo | el dueño tiene una categoría de gasto | edita el nombre | la categoría queda actualizada |
| AC-07 | Rechazar edición que cambia tipo cuando ya hay transacciones | el dueño tiene una categoría de gasto con transacciones | intenta cambiar a ingreso | el sistema rechaza la edición |
| AC-08 | Eliminar categoría sin transacciones | el dueño tiene una categoría sin transacciones | elimina la categoría | la categoría queda eliminada |
| AC-09 | Rechazar eliminación de categoría usada en transacciones | el dueño tiene una categoría con transacciones asociadas | intenta eliminar | el sistema rechaza la eliminación |
| AC-10 | Categoría no usada en presupuesto puede eliminarse si no tiene transacciones | el dueño tiene una categoría sin transacciones ni presupuestos | elimina | la categoría queda eliminada |

## 7. Ejemplos ejecutables

```bash
# 1. Listar categorías del espacio
curl -s -b /tmp/gastos.cookies http://127.0.0.1:8100/api/categories

# 2. Crear categoría de gasto sin jerarquía
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"name":"Comida","kind":"expense"}' \
  http://127.0.0.1:8100/api/categories

# 3. Crear categoría de ingreso con padre
curl -s -b /tmp/gastos.cookies -H 'Content-Type: application/json' \
  -d '{"name":"Sueldo","kind":"income","parentId":"..."}' \
  http://127.0.0.1:8100/api/categories
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | Las categorías se guardan en centavos y con auditoría; sin `REAL`; transacciones atómicas cuando se asignan a transacciones y presupuestos. |
| De negocio | Tipos: gasto, ingreso. |
| De negocio | Cada categoría pertenece a un solo espacio (el del dueño, en esta iteración). |
| De negocio | No se puede quitar jerarquía si ya hay dependencias; pendiente de regla concreta. |
| De negocio | Una categoría usada en transacciones no puede eliminarse; pendiente de regla concreta para reasignación. |

## 9. Contratos

Los endpoints de categorías están definidos en `docs/API.md` §5:

| Método | Ruta | Notas |
|---|---|---|
| GET | `/api/categories?kind=expense\|income` | árbol de un nivel |
| POST | `/api/categories` | `{ name, kind, parentId?, color?, icon? }` |
| PATCH | `/api/categories/:id` | renombrar, recolorear, mover de padre |
| POST | `/api/categories/:id/archive` | prohibido si tiene movimientos (I-05) |

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ✅ **Schema de `categories` (alineado a AGENT.md §6.1 canónico):** `categories(id PK, space_id FK spaces, name, kind CHECK IN ('expense','income'), parent_id FK categories NULL, color, icon, archived INTEGER DEFAULT 0, created_at, updated_at, UNIQUE(space_id, kind, name))`. Incluye `color`, `icon` e `archived` (I-05 bajas lógicas). El `UNIQUE(space_id, kind, name)` garantiza unicidad por nombre dentro del tipo y el espacio. Decisión cerrada.
- ✅ **Profundidad de jerarquía:** un solo nivel (padre → hijo). No se permite jerarquía multinivel en esta iteración. `parent_id` es NULL o apunta a una categoría raíz del mismo `kind`. Decisión cerrada.
- ✅ **Eliminación de categoría con transacciones:** se rechaza con `409` y código `CATEGORY_IN_USE`. No se permite eliminación ni reasignación automática; el dueño debe reasignar las transacciones manualmente antes de eliminar. Consistente con I-05 (`AGENT.md` §7). Decisión cerrada.
- ✅ **Edición de tipo cuando tiene transacciones:** no se permite cambiar `kind` de una categoría si tiene transacciones asociadas (rechazo con `409`). Coherente con la regla de I-05 y con SPEC-004 §6 AC-07. Decisión cerrada.

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

*Spec aprobada el 2026-09-21. Contrato único de verdad para el módulo de categorías.*
