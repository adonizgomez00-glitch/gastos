#!/usr/bin/env bash
# gen-context-live.sh — regenera docs/Context_live.md (estado vivo de infraestructura).
#
#   * Escribe SOLO entre los marcadores BEGIN/END GENERADO.
#   * Las notas manuales (fuera de los marcadores) SOBREVIVEN a la regeneracion.
#   * El archivo resultante esta en .gitignore (no se publica inventario de infraestructura).
#
# Uso: npm run context:live   (o ./scripts/gen-context-live.sh)
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$PROJECT_DIR/docs/Context_live.md"
PORT="${GASTOS_PORT:-8100}"
PUBLIC_URL="https://thinkpad.tail60dd6a.ts.net/gastos/"
DATA_DIR="${GASTOS_DATA_DIR:-$PROJECT_DIR/data}"
NOW="$(date '+%Y-%m-%d %H:%M')"
TZ_NAME="$(date '+%Z')"

# --- estado del servicio ---
if systemctl list-unit-files 2>/dev/null | grep -q '^gastos\.service'; then
    SVC_STATE="$(systemctl is-active gastos 2>/dev/null || echo inactive)"
else
    SVC_STATE="no existe"
fi
if [ "$SVC_STATE" = "active" ]; then
    OVERALL="ok"
elif [ "$SVC_STATE" = "no existe" ]; then
    OVERALL="n/a - servicio no instalado"
else
    OVERALL="degradado ($SVC_STATE)"
fi

# --- puerto ---
if ss -tlnH 2>/dev/null | grep -q ":${PORT} "; then
    PORT_STATE="escuchando"
else
    PORT_STATE="libre"
fi

# --- health interno ---
if ! HEALTH_CODE="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null)"; then HEALTH_CODE=""; fi
[ -z "$HEALTH_CODE" ] && HEALTH_CODE="sin respuesta"

# --- salud publica ---
if ! PUBLIC_CODE="$(curl -s -o /dev/null -m 8 -w '%{http_code}' "${PUBLIC_URL}api/health" 2>/dev/null)"; then PUBLIC_CODE=""; fi
[ -z "$PUBLIC_CODE" ] && PUBLIC_CODE="sin respuesta"

# --- disco, entorno ---
DISK_TABLE="$(df -h / /home 2>/dev/null | awk 'NR>1 && NF>=6 {printf "| %s | %s | %s | %s | %s | %s |\n", $1, $6, $2, $3, $4, $5}')"
MAX_PCT="$(df -h / /home 2>/dev/null | awk 'NR>1 {gsub("%","",$5); if ($5+0>m) m=$5+0} END {print m+0}')"
NODE_VER="$(node --version 2>/dev/null || echo '?')"

# --- base de datos, backups, cotizaciones ---
DB_FILE="$DATA_DIR/gastos.db"
if [ -f "$DB_FILE" ]; then
    DB_INFO="$(du -h "$DB_FILE" | cut -f1) - $(sqlite3 "$DB_FILE" "SELECT COALESCE((SELECT MAX(id) FROM schema_migrations),'sin migraciones') FROM sqlite_master LIMIT 1;" 2>/dev/null || echo '?')"
    DB_ROW="$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM transactions;" 2>/dev/null || echo '?')"
    RATE_ROW="$(sqlite3 "$DB_FILE" "SELECT rate_micro || '|' || rate_date || '|' || source FROM exchange_rates ORDER BY rate_date DESC LIMIT 1;" 2>/dev/null || echo '')"
else
    DB_INFO="no creada"; DB_ROW="-"; RATE_ROW=""
fi
if [ -n "$RATE_ROW" ]; then
    RATE_MICRO="$(echo "$RATE_ROW" | cut -d'|' -f1)"; RATE_DATE="$(echo "$RATE_ROW" | cut -d'|' -f2)"; RATE_SRC="$(echo "$RATE_ROW" | cut -d'|' -f3)"
    RATE_TXT="1 USD = $(awk -v m="$RATE_MICRO" 'BEGIN{printf "%.6f", m/1000000}') GTQ ($RATE_DATE, $RATE_SRC)"
    RATE_AGE_DAYS="$(( ( $(date +%s) - $(date -d "$RATE_DATE" +%s 2>/dev/null || date +%s) ) / 86400 ))"
    if [ "$RATE_AGE_DAYS" -le 1 ]; then RATE_FRESH="ok"; else RATE_FRESH="stale (${RATE_AGE_DAYS} d)"; fi
else
    RATE_TXT="sin datos"; RATE_FRESH="missing"
fi
LAST_BACKUP="$(ls -1t "$PROJECT_DIR"/backups/*.db 2>/dev/null | head -1 || true)"
if [ -n "$LAST_BACKUP" ]; then LAST_BACKUP="$(basename "$LAST_BACKUP") - $(du -h "$LAST_BACKUP" | cut -f1)"; else LAST_BACKUP="ninguno"; fi

# --- version desplegada ---
if [ -d /opt/gastos/.git ]; then
    DEPLOYED="$(git -C /opt/gastos rev-parse --short HEAD 2>/dev/null || echo '?')"
else
    DEPLOYED="ninguna"
fi

# --- nginx ---
VHOSTS="$(ls /etc/nginx/sites-enabled/ 2>/dev/null | tr '\n' ' ' || echo '?')"
if grep -rqs 'location /gastos/' /etc/nginx/sites-enabled/ 2>/dev/null; then LOC_GASTOS="presente"; else LOC_GASTOS="ausente"; fi
LOC_OTHER="$(grep -rhs 'location ' /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^[[:space:]]*//' | tr '\n' '; ' || true)"
FUNNEL="$(tailscale funnel status 2>/dev/null | grep -E '^https|proxy' | tr '\n' ' ' | tr '|' ' ' | tr -s ' ' || echo 'no disponible')"
WATCHDOG="$(crontab -l 2>/dev/null | grep -c 'quimica/watchdog.sh' || echo 0)"

# --- notas manuales previas (fuera de los marcadores) ---
MANUAL=""
if [ -f "$OUT" ]; then
    MANUAL="$(awk '/<!-- END GENERADO -->/{flag=1; next} flag' "$OUT" | sed '/^$/N;/^\n$/D')"
fi
[ -z "$MANUAL" ] && MANUAL="&lt;agregá acá observaciones, incidentes o decisiones operativas&gt;"

mkdir -p "$(dirname "$OUT")"

{
cat <<EOF
# Context_live.md - Estado vivo de infraestructura

**Generado el**: $NOW ($TZ_NAME)
**Estado**: $OVERALL
**Generado por**: \`./scripts/gen-context-live.sh\` (no editar dentro de los marcadores)
**Estado del proyecto**: ver \`CHECKPOINT.md\` - este documento no describe módulos, tests ni próximos pasos

<!-- BEGIN GENERADO -->

## 1. Entorno de ejecución

| Propiedad | Valor |
|-----------|-------|
| **Hostname** | $(hostname) |
| **Distribución** | $(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2) |
| **Kernel** | $(uname -r) |
| **CPU / RAM** | $(nproc) cores · $(free -h | awk 'NR==2 {print $2" total / "$3" usada / "$4" libre"}') |
| **Node** | $NODE_VER |

## 2. Disco

| Disco | Montado | Tamaño | Usado | Libre | Uso% |
|-------|---------|--------|-------|-------|------|
$DISK_TABLE

$( [ "$MAX_PCT" -gt 85 ] && echo "> ⚠️ **Alerta**: algún disco supera el 85 % ($MAX_PCT %)" )

## 3. Servicio de la aplicación

| Propiedad | Valor | Medición |
|-----------|-------|----------|
| Unidad systemd | $SVC_STATE | \`systemctl is-active gastos\` |
| Puerto interno | $PORT ($PORT_STATE) | \`ss -tlnp\` |
| Versión desplegada | $DEPLOYED | \`git -C /opt/gastos rev-parse --short HEAD\` |
| Health interno | $HEALTH_CODE | \`curl http://127.0.0.1:$PORT/api/health\` |
| Base de datos | $DB_INFO | \`ls -l data/gastos.db\` |
| Transacciones registradas | $DB_ROW | \`sqlite3\` |
| Último backup | $LAST_BACKUP | \`ls -t backups/\` |
| Cotización USD->GTQ | $RATE_TXT | \`sqlite3 exchange_rates\` |
| Frescura de la cotización | $RATE_FRESH | tabla \`exchange_rates\` |

## 4. Publicación

| Propiedad | Valor | Medición |
|-----------|-------|----------|
| URL pública | $PUBLIC_URL ($PUBLIC_CODE) | \`curl\` |
| Funnel | $FUNNEL | \`tailscale funnel status\` |
| Vhosts habilitados | $VHOSTS | \`ls /etc/nginx/sites-enabled/\` |
| Location /gastos/ | $LOC_GASTOS | \`grep -r location\` |
| Otros locations | $LOC_OTHER | \`grep -r location\` |
| Watchdog de Química en cron | $WATCHDOG entrada(s) | \`crontab -l\` |

## 5. Riesgos de infraestructura observados

| Riesgo | Medición | Nota |
|--------|----------|------|
| Disco al $MAX_PCT % | \`df -h\` | vigilar si supera el 85 % |
| Cotización: $RATE_FRESH | \`exchange_rates\` | si está stale, correr \`npm run rates:refresh\` |
| Servicio: $SVC_STATE | \`systemctl is-active gastos\` | si no está activo, revisar \`journalctl -u gastos\` |

## 6. Pendientes de infraestructura

- [ ] \`<los genera el equipo cuando corresponda>\`

<!-- END GENERADO -->

---

## Notas manuales (sobreviven a la regeneración)

$MANUAL
EOF
} > "$OUT"

chmod 600 "$OUT" 2>/dev/null || true
echo "✅ Context_live.md regenerado: $OUT (estado: $OVERALL)"
