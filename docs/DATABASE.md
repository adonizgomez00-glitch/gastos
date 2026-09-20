# DATABASE.md — Gastos

**Motor:** SQLite (`node:sqlite` / `DatabaseSync`)
**Archivo:** `data/gastos.db` (WAL) — **fuera de git**
**Referencia única del esquema:** `AGENT.md` §6 (este documento no lo duplica)

---

## 1. Apertura y PRAGMA obligatorios

```js
// server/database/sqlite.js — único lugar autorizado
const db = new DatabaseSync(file)
db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA foreign_keys=ON')
db.exec('PRAGMA busy_timeout=5000')
```

Motivos: WAL permite leer mientras se escribe; `foreign_keys=ON` evita huérfanos; `busy_timeout`
evita errores `SQLITE_BUSY` cuando el backup o un script tocan el archivo.

## 2. Reglas de datos

| Regla | Detalle |
|---|---|
| Dinero | `INTEGER` en **centavos**; prohibido `REAL` en columnas monetarias (I-01) |
| Tasa | `rate_micro INTEGER` = tasa × 1.000.000 (I-02) |
| IDs | `TEXT` con `randomUUID()` |
| Fechas de negocio | `TEXT` `YYYY-MM-DD` en `America/Guatemala` (I-09) |
| Marcas de tiempo | `TEXT` ISO-8601 UTC |
| Booleanos | `INTEGER` 0/1 |
| Integridad | FKs con `ON DELETE RESTRICT`; nada se borra en cascada |
| Bajas | lógicas con `archived INTEGER` (I-05) |
| Textos | `TEXT` con `CHECK` cuando el dominio es cerrado (`kind`, `type`, `frequency`, `source`) |

## 3. Migraciones

- Formato: `server/database/migrations/NNN_nombre.js` → `export const migration = { id, up(db) }`
- `applyMigrations(db, migrations)` crea `schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT)`
  y **solo aplica lo pendiente**; es seguro ejecutarla en cada arranque.
- Una migración aplicada **no se edita**: se agrega la siguiente.
- `npm run migrate` ejecuta lo mismo fuera del arranque (para el despliegue).

## 4. Índices

Definidos en `AGENT.md` §6.1 (mes, categoría, transferencias, cuentas, categorías, tasas, sesiones y recurrentes).

## 5. Transacciones y concurrencia

- Toda operación de dinero con más de un `INSERT`/`UPDATE` va en una transacción del **Service**
(`BEGIN IMMEDIATE` → trabajo → `COMMIT`; ante error, `ROLLBACK`).
- Hay **un solo proceso escritor** (la app). Los scripts (`backup-db.sh`, `rates-refresh`, `migrate`)
son de corta duración y usan `busy_timeout`.

## 6. Backup y restauración

```bash
npm run backup:db   # sqlite3 data/gastos.db ".backup 'backups/gastos-YYYYMMDD-HHMM.db'"
```

- **Nunca** `cp` del `.db` con la app escribiendo (se puede copiar un estado inconsistente junto al `-wal`).
- Verificación de integridad sugerida: `sqlite3 <backup> 'PRAGMA integrity_check;'`
- Retención: 30 diarios + 12 mensuales.
- Restauración: detener el servicio → reemplazar `data/gastos.db` (y borrar `-wal`/`-shm`) → arrancar →
verificar `/api/health` y **un total conocido**.

## 7. Consultas de diagnóstico útiles

```sql
-- cuadre del mes: debe dar exactamente 0 de diferencia
SELECT SUM(CASE WHEN kind='expense' THEN amount_base_cents ELSE -amount_base_cents END)
FROM transactions WHERE space_id=? AND occurred_on>=? AND occurred_on<? AND kind<>'transfer';

-- recurrentes duplicados (debe devolver 0 filas)
SELECT rule_id, period_key, COUNT(*) FROM recurring_runs GROUP BY 1,2 HAVING COUNT(*)>1;

-- transacciones sin tasa congelada (debe devolver 0 filas)
SELECT COUNT(*) FROM transactions WHERE rate_source IS NULL;

-- columnas monetarias con tipo REAL (debe devolver 0 filas)
SELECT m.name FROM pragma_table_info('transactions') m WHERE m.name LIKE '%cents%' AND m.type<>'INTEGER';
```

## 8. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación: PRAGMA, reglas de datos, migraciones, concurrencia, backup y consultas de diagnóstico. |
