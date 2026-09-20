# DEPLOYMENT.md — Gastos

**Estado:** procedimiento **documentado y no ejecutado** (se ejecuta cuando exista código funcionando).
**Base verificada el 2026-09-20** en la máquina `thinkpad`.

> ⚠️ **Regla de oro del despliegue:** el Funnel **no se toca**, el vhost nginx se edita de forma
> **aditiva** con backup previo, y **siempre** se verifica que Química siga respondiendo 200.
> Motivo: el 2026-09-14/15 una edición del vhost dejó `:8080` sin listener y tumbó el servicio
> (`~/Config-System/runbooks/nginx-funnel-8080-refused.md`).

---

## 1. Cadena de publicación

```
Internet
  → Tailscale Funnel  https://thinkpad.tail60dd6a.ts.net   (ruta: / → http://127.0.0.1:8000)
  → nginx :8000       (vhost activo: /etc/nginx/sites-enabled/quimica)
  → location /gastos/ → http://127.0.0.1:8100
  → gastos.service (systemd, usuario gastos) → node server/index.js
```

Estado inicial verificado: Funnel `/` → `:8000`; vhost con `location /quimica/` → `:5001` y
`location /` → `:8001`; **no existe** `gastos.service` ni `/opt/gastos` ni el usuario `gastos`;
puerto **8100 libre**.

## 2. Por qué `location` y no una ruta del Funnel (ADR-005)

`/home/adonis/apps-locales/quimica/watchdog.sh` corre por cron cada 5 minutos y su función
`restart_funnel()` ejecuta:

```bash
tailscale funnel --https=443 off        # borra TODAS las rutas del Funnel
tailscale funnel --bg 8000              # vuelve a dejar solo "/"
```

Una ruta `/gastos` puesta en el Funnel **desaparecería** en el siguiente ciclo (es lo que ocurrió
con `/microwhatsapp` en adoniz-acer). Como `location` de nginx, `/gastos/` **sobrevive**.

## 3. Preparación

```bash
# 1. Backup del vhost ANTES de cualquier edición
sudo cp /etc/nginx/sites-enabled/quimica /etc/nginx/sites-enabled/quimica.bak-$(date +%Y%m%d)

# 2. Usuario y directorio de sistema
sudo useradd --system --home /opt/gastos --shell /usr/sbin/nologin gastos
sudo mkdir -p /opt/gastos

# 3. Código + dependencias + datos
sudo cp -r <repo>/server <repo>/src <repo>/assets <repo>/index.html /opt/gastos/
sudo cp <repo>/package.json /opt/gastos/
sudo -u gastos npm run migrate --prefix /opt/gastos      # crea data/gastos.db
sudo -u gastos npm run user:create --prefix /opt/gastos  # alta del dueño (interactivo)
sudo chown -R gastos:gastos /opt/gastos
```

**`/opt/gastos/.env` (chmod 600, fuera de git):**

```ini
NODE_ENV=production
GASTOS_HOST=127.0.0.1
GASTOS_PORT=8100
GASTOS_BASE_PATH=/gastos
GASTOS_BASE_CURRENCY=GTQ
GASTOS_TIMEZONE=America/Guatemala
GASTOS_DATA_DIR=/opt/gastos/data
GASTOS_SESSION_COOKIE=gastos_session
GASTOS_SESSION_TTL_MINUTES=720
GASTOS_COOKIE_SECURE=1
```

## 4. Unidad systemd

`/etc/systemd/system/gastos.service`:

```ini
[Unit]
Description=Gastos - administrador de gastos personales
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=gastos
Group=gastos
WorkingDirectory=/opt/gastos
EnvironmentFile=/opt/gastos/.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/gastos/server/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

No usar `PrivateTmp` ni `ProtectSystem` (error 226 NAMESPACE en este equipo) ni `DynamicUser`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gastos.service
systemctl status gastos.service --no-pager
```

## 5. nginx (edición aditiva)

Agregar **dentro** del `server` existente del vhost (sin modificar lo que ya está):

```nginx
    location /gastos/ {
        proxy_pass http://127.0.0.1:8100/;   # la barra final quita el prefijo
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

```bash
pkexec nginx -t          # debe decir: syntax is ok / test is successful
pkexec systemctl reload nginx
```

> En esta máquina `sudo` pide contraseña: los cambios de sistema se hacen con **`pkexec`**
> (patrón ya usado en el despliegue de zeroQA).

## 6. Verificación obligatoria (en este orden)

```bash
# 1. La app responde en el puerto interno
curl -s -o /dev/null -w 'interno  %{http_code}\n' http://127.0.0.1:8100/api/health

# 2. NO se rompió Química
curl -s -o /dev/null -w 'quimica  %{http_code}\n' http://127.0.0.1:8000/quimica/

# 3. La ruta pública funciona punta a punta
curl -s -o /dev/null -w 'publico  %{http_code}\n' https://thinkpad.tail60dd6a.ts.net/gastos/api/health

# 4. El estado vivo refleja la realidad
npm run context:live
```

Si el paso 2 falla: restaurar `quimica.bak-YYYYMMDD`, recargar nginx y **no** seguir.

## 7. Operación

| Tarea | Comando |
|---|---|
| Estado | `systemctl status gastos --no-pager` |
| Logs | `journalctl -u gastos -n 100 --no-pager` |
| Refrescar tasas | `sudo -u gastos npm run rates:refresh --prefix /opt/gastos` |
| Backup | `sudo -u gastos npm run backup:db --prefix /opt/gastos` |
| Backup diario | cron: `15 3 * * * cd /opt/gastos && npm run backup:db` |
| Estado vivo | `cd /opt/gastos && npm run context:live` |

## 8. Rollback

| Qué | Cómo |
|---|---|
| Código | `git checkout <tag>` en `/opt/gastos` + `systemctl restart gastos` |
| nginx | restaurar `quimica.bak-YYYYMMDD` + `pkexec nginx -t && pkexec systemctl reload nginx` |
| Base de datos | detener el servicio, restaurar el backup, borrar `-wal`/`-shm`, arrancar |
| Migración defectuosa | **no** revertir a mano: agregar una migración correctiva |

## 9. Riesgos conocidos del despliegue

Las cuatro filas de `AGENT.md` §10.8 (ruptura de Química, watchdog del Funnel, disco al 86 %,
`sudo` con contraseña), más: el puerto 8100 debe seguir libre al momento de desplegar; se verifica
con `ss -tlnp | grep :8100` antes de empezar.

## 10. Changelog

| Fecha | Cambio |
|---|---|
| 2026-09-20 | Creación: cadena de publicación, procedimiento, verificación, operación y rollback. |
