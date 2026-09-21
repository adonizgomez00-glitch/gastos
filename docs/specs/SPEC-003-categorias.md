---
spec_id: SPEC-003
titulo: Categorías (gasto/ingreso, jerárquicas)
version: 0.1.0
estado: propuesta
fecha: 2026-09-20
autor: Adonis (con asistencia del agente)
relacionadas: [SPEC-001, SPEC-002, SPEC-004, SPEC-006, SPEC-010]
adrs: []
---

# SPEC-003 — Categorías (gasto/ingreso, jerárquicas)

> Estado: propuesta · Iteración de implementación: ITER-002

## 1. Problema

El sistema necesita un catálogo de categorías para clasificar ingresos y gastos y poder reportar por categoría después. Sin categorías, no hay forma de organizar las transacciones ni de hacer presupuestos por categoría (que entra con SPEC-006).

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | El dueño quiere clasificar sus movimientos en categorías familiares: Comida, Transporte, Sueldo, etc. |
| Escenario | El dueño registra categorías, puede usarlas en transacciones y luego consulta totals por categoría. |
| Limitaciones | No se implementa multiusuario en esta iteración; hay un solo espacio de trabajo del dueño. |
| Riesgo principal | Que las categorías queden planas, o que no se pueda distinguir gasto de ingreso, o que no se pueda reusar una categoría en presupuestos. |

Este documento se basa en el estilo de ADR y en la estructura de datos que ya figuran en el proyecto; no se inventa comportamiento que ya esté decidido.

## 3. Objetivo (falsable)

> El sistema permite crear, editar y eliminar categorías con nombre, tipo (gasto o ingreso), jerarquía opcional y cualquier otra propiedad necesaria; las categorías se reifican en transacciones y en presupuestos.

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

## 9. Contratos (si aplica)

PENDIENTE: contratos HTTP de categorías se formalizan en `docs/API.md` cuando la spec se aprueba; se deja claro que las categorías se relacionan con transacciones y con presupuestos.

## 10. Trazabilidad

PENDIENTE: tabla AC → test → archivo de código, que se completa cuando la spec se aprueba y se implementa.

## 11. Notas y decisiones abiertas

- ❓ ¿Cuál es el Schema exacto de la tabla `categories`? Se sugiere: `id, space_id, name, kind, parent_id?, created_at, updated_at`.
- ❓ ¿Qué profundidad máxima de jerarquía se permite en esta iteración? Se asume acotada.
- ❓ ¿Cómo se manejan las transacciones asociadas cuando se intenta quitar una categoría? Se asume que se rechaza la eliminación o se requiere reasignación; pendiente de decisión.
- ❓ ¿Se permite editar el tipo de categoría cuando tiene transacciones asociadas? Se asume que no, pero queda pendiente de decisión.

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
