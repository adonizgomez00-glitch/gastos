# Context_live.md — Plantilla (versionada)

> Esta es la **plantilla** versionada en git. El archivo real es `docs/Context_live.md`,
> **generado** por `./scripts/gen-context-live.sh` y **excluido de git** (`.gitignore`).
> Motivo (regla dura de `~/Config-System`): **no se publica inventario de infraestructura**.
> Backup: el cron diario de rsync de `/home`.
>
> El generador escribe **solo** entre `<!-- BEGIN GENERADO -->` y `<!-- END GENERADO -->`.
> Todo lo que esté fuera de esos marcadores **sobrevive** a la regeneración.

---

# Context_live.md — Estado vivo de infraestructura

**Generado el**: `<YYYY-MM-DD HH:MM>` (`<zona>`)
**Estado**: `<ok | degradado | n/a — servicio no instalado>`
**Generado por**: `./scripts/gen-context-live.sh` (no editar dentro de los marcadores)
**Estado del proyecto**: ver [`../CHECKPOINT.md`](../CHECKPOINT.md) — este documento **no** describe
módulos, tests ni próximos pasos (dueño único por dato, `AGENT.md` §13.3)

<!-- BEGIN GENERADO -->

## 1. Entorno de ejecución

| Propiedad | Valor |
|-----------|-------|
| **Hostname** | `<hostname>` |
| **Distribución** | `<PRETTY_NAME>` |
| **Kernel** | `<uname -r>` |
| **CPU / RAM** | `<nproc> cores` · `<RAM total/usado/libre>` |
| **Node** | `<node --version>` |
| **Uptime** | `<uptime -p>` |

## 2. Disco

| Disco | Montado | Tamaño | Usado | Libre | Uso% |
|-------|---------|--------|-------|-------|------|
| `<dev>` | `/` | `<…>` | `<…>` | `<…>` | `<…>` |
| `<dev>` | `/home` | `<…>` | `<…>` | `<…>` | `<…>` |

> ⚠️ **Alerta**: `<si algún disco supera el 85 %>`

## 3. Servicio de la aplicación

| Propiedad | Valor | Medición |
|-----------|-------|----------|
| Unidad systemd | `<gastos.service — active (running) | inactive | no existe>` | `systemctl show gastos -p ActiveState` |
| Usuario / directorio | `<usuario gastos>` · `</opt/gastos>` | `id gastos` · `ls /opt/gastos` |
| Puerto interno | `<8100 escuchando (pid …) | libre>` | `ss -tlnp` |
| Versión desplegada | `<git -C /opt/gastos rev-parse --short HEAD | ninguna>` | `git` |
| Health interno | `<200 {"status":"ok",…} | sin respuesta>` | `curl http://127.0.0.1:8100/api/health` |
| Base de datos | `<tamaño> · <migración> · <nº transacciones>` | `ls -l data/gastos.db` · `sqlite3` |
| Último backup | `<fecha> · <tamaño>` | `ls -l backups/` |
| Cotización | `<tasa> · <rate_date> · <source>` | `sqlite3 exchange_rates` |
| Frescura de cotizaciones | `ok (<=24 h) | stale (>24 h) | missing` | `exchange_rates` |

## 4. Publicación (nginx + Tailscale Funnel)

| Propiedad | Valor | Medición |
|-----------|-------|----------|
| URL pública | `https://<host>.ts.net/gastos/` · `<código http>` | `curl -o /dev/null -w '%{http_code}'` |
| Funnel | `<ruta> -> <destino>` | `tailscale funnel status` |
| Vhost activo | `<archivo>` (`listen <puerto>`) | `ls -l /etc/nginx/sites-enabled/` |
| Location `/gastos/` | `<presente: proxy_pass … | ausente>` | `nginx -T` |
| Otros locations | `<…>` | `nginx -T` |
| Watchdog de Química | `/home/adonis/apps-locales/quimica/watchdog.sh` (`*/5 * * * *`) | `crontab -l` |

## 5. Servicios systemd relevantes

| Servicio | Estado | Descripción |
|----------|--------|-------------|
| gastos | `<…>` | app de gastos (puerto 8100) |
| nginx | `<…>` | proxy `:8000` |
| tailscaled | `<…>` | Funnel público |
| `<otro>` | `<…>` | `<…>` |

## 6. Riesgos de infraestructura

| Riesgo | Medición | Nota |
|--------|----------|------|
| `<…>` | `<comando>` | `<…>` |

## 7. Pendientes de infraestructura

- [ ] `<…>`

<!-- END GENERADO -->

---

## Notas manuales (sobreviven a la regeneración)

- `<fecha>` — `<observación, incidente, decisión operativa>`
