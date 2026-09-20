---
spec_id: SPEC-XXX
titulo: <título corto y verificable>
version: 0.1.0
estado: propuesta
fecha: YYYY-MM-DD
autor: <quién la escribe>
relacionadas: []
adrs: []
---

# SPEC-XXX — <Título>

## 1. Problema

<Qué duele hoy, en términos concretos. Si se entiende sin contexto adicional, está bien escrita.>

## 2. Contexto

| Aspecto | Detalle |
|---|---|
| Usuario real | <quién, dónde, en qué situación> |
| Escenario | <cuándo y cómo lo usa> |
| Limitaciones | <dispositivo, conectividad, prisa, conocimientos> |

## 3. Objetivo (falsable)

> <"El sistema hace X" — verificable en binario: se cumple o no se cumple.>

**No se cumple si:** <criterio de fallo explícito>

## 4. Alcance

### 4.1 Incluye

- <capacidad 1>
- <capacidad 2>

### 4.2 No incluye

- <exclusión 1, con el motivo>
- <exclusión 2, con el motivo>

> Regla: **ninguna de las dos listas puede quedar vacía.**

## 5. Comportamiento

### 5.1 Flujo principal

1. <paso>
2. <paso>

### 5.2 Flujos alternativos

- **<situación>** → <respuesta del sistema>

### 5.3 Casos límite

- <borde 1>
- <borde 2>

## 6. Criterios de aceptación

| ID | Escenario | Dado (Given) | Cuando (When) | Entonces (Then) |
|----|-----------|--------------|---------------|-----------------|
| AC-01 | <nombre> | <estado inicial> | <acción> | <resultado binario> |
| AC-02 | | | | |

## 7. Ejemplos ejecutables

```bash
# <flujo crítico>
<comando real con el resultado esperado>
```

## 8. Restricciones

| Tipo | Restricción |
|---|---|
| Técnica | <stack, límites, rendimiento> |
| De negocio | <reglas del dominio, monedas, zonas horarias> |
| De seguridad | <autenticación, autorización, datos sensibles> |

## 9. Contratos (si aplica)

<Endpoints, formas de petición y respuesta. Se documentan también en docs/API.md.>

## 10. Trazabilidad

| AC | Test | Archivo de código |
|----|------|-------------------|
| AC-01 | `<nombre del test>` | `<archivo>` |

## 11. Notas y decisiones abiertas

- <decisión tomada con fecha>
- ❓ <decisión abierta: qué falta definir y quién decide>

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
[ ] Trazabilidad AC → test → código
[ ] Aprobación explícita del dueño
```
