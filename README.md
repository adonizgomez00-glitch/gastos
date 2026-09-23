# Gastos — administrador de gastos personales en línea

Aplicación web (mobile-first) para registrar y entender **en qué se va el dinero**, en
**quetzales (GTQ)** y **dólares (USD)** con conversión automática y cotización congelada
por transacción. Incluye múltiples cuentas, transferencias, presupuestos mensuales por
categoría, gastos recurrentes y reportes del mes.

**Estado actual: Fase 0 — documentación cerrada, sin código.** Ver [`CHECKPOINT.md`](./CHECKPOINT.md).

---

## Documentación

| Documento | Para qué sirve |
|---|---|
| [`AGENT.md`](./AGENT.md) | **Contrato operativo** (empezar acá): alcance, reglas, invariantes, comandos |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | C4, capas MVC, esquema SQLite, ADRs |
| [`CHECKPOINT.md`](./CHECKPOINT.md) | Estado del proyecto, módulos, tests, próximo paso |
| [`docs/CONTEXT.md`](./docs/CONTEXT.md) | Dominio, glosario, convenciones, decisiones de negocio |
| [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) | Tareas ✅/🔄/⏳, métricas, deuda técnica, riesgos |
| [`docs/QA_RESULTS.md`](./docs/QA_RESULTS.md) | Historial de QA por iteración |
| [`docs/API.md`](./docs/API.md) | Endpoints REST |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Tablas, índices y migraciones |
| [`docs/SECURITY.md`](./docs/SECURITY.md) | Modelo de amenazas y controles |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | systemd + nginx `/gastos/` + Funnel (procedimiento verificado) |
| [`docs/specs/`](./docs/specs/) | Specs SDD por módulo (Given/When/Then antes de codificar) |

---

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 22 (`node:sqlite` / `DatabaseSync`, sin ORM) |
| Servidor | `node:http` + router propio + MVC estricto (`View → Controller → Service → Repository → DB`) |
| Cliente | HTML + CSS + JavaScript ES Modules vanilla (sin build, sin frameworks) |
| Datos | SQLite (WAL) en `data/gastos.db` |
| Cotizaciones | `open.er-api.com` (primaria) · Banguat SOAP (secundaria) · override manual |

---

## Comandos (referencia; el código llega en Fase 4)

```bash
npm start            # node --disable-warning=ExperimentalWarning server/index.js
npm run dev          # igual, con --watch
npm run migrate      # aplica migraciones pendientes
npm run user:create  # crea el usuario dueño (no hay registro público)
npm run rates:refresh # actualiza cotizaciones USD->GTQ
npm run backup:db    # backup consistente con sqlite3 .backup
npm run context:live # regenera docs/Context_live.md (local, fuera de git)
npm test             # tests unitarios + integración (runner propio, sin dependencias)
npm run test:e2e     # Playwright contra el servidor local
npm run check:docs   # verifica que CHECKPOINT.md y docs/Context_live.md no se contradigan
```

---

## Despliegue (objetivo)

`gastos.service` (systemd) en `/opt/gastos` escuchando en `127.0.0.1:8100`, publicado por el
vhost nginx que ya escucha en `:8000` mediante `location /gastos/`, y accesible como
`https://thinkpad.tail60dd6a.ts.net/gastos/`. El Funnel **no** se toca (sigue siendo `/` → `:8000`).
Procedimiento exacto, con backups y verificación de no-ruptura de Química: `docs/DEPLOYMENT.md`.

---

## Licencia

Licencia GPL v. 2 (GNU General Public License, versión 2).
