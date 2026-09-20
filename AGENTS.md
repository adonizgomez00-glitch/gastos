# AGENTS.md — puntero

> Este archivo existe solo para que las herramientas que autocargan `AGENTS.md`
> (opencode, Codex, Cursor, cline, hermes) encuentren el proyecto. **El documento canónico es
> [`AGENT.md`](./AGENT.md).**

Antes de tocar cualquier archivo, leé en este orden:

1. **`AGENT.md`** — contrato operativo, alcance, reglas e invariantes.
2. **`ARCHITECTURE.md`** — capas, esquema de datos y ADRs.
3. **`CHECKPOINT.md`** — estado actual del proyecto y próximo paso.
4. **`docs/CONTEXT.md`** — dominio, convenciones y reglas de negocio.

**Regla de oro:** no se escribe una sola línea de código hasta que el usuario diga
**"implementar"** (o equivalente explícito), y no se inventan requisitos: se pregunta.

**Estado de infraestructura:** `docs/Context_live.md` (local, **fuera de git**; puede no existir).
