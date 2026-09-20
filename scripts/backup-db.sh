#!/usr/bin/env bash
# backup-db.sh — backup consistente de la base de datos con `sqlite3 .backup`.
# Nunca copiar el archivo con `cp` mientras la app escribe (puede quedar inconsistente).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${GASTOS_DATA_DIR:-$PROJECT_DIR/data}"
DB_FILE="$DATA_DIR/gastos.db"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP_DAILY=30

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
    echo "Sin base de datos todavía ($DB_FILE): nada que respaldar."
    exit 0
fi

STAMP="$(date '+%Y%m%d-%H%M')"
OUT="$BACKUP_DIR/gastos-$STAMP.db"

sqlite3 "$DB_FILE" ".backup '$OUT'"
INTEGRITY="$(sqlite3 "$OUT" 'PRAGMA integrity_check;' | head -1)"
SIZE="$(du -h "$OUT" | cut -f1)"

echo "✅ Backup: $OUT ($SIZE) · integrity_check: $INTEGRITY"

# Retención: se conservan los 30 backups más recientes
COUNT="$(ls -1 "$BACKUP_DIR"/gastos-*.db 2>/dev/null | wc -l)"
if [ "$COUNT" -gt "$KEEP_DAILY" ]; then
    ls -1t "$BACKUP_DIR"/gastos-*.db | tail -n "+$((KEEP_DAILY + 1))" | while read -r old; do
        rm -f "$old"
        echo "   retirado por retención: $(basename "$old")"
    done
fi
