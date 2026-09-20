#!/usr/bin/env node
/**
 * migrate.js — aplica las migraciones pendientes (idempotente).
 * Uso: npm run migrate
 */
import { bootstrap } from '../server/bootstrap.js'

try {
  const { config, logger, db } = bootstrap({ logLevel: process.env.GASTOS_LOG_LEVEL || 'info' })
  const applied = db.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map((r) => r.id)
  console.log(`Base de datos: ${config.dbFile}`)
  console.log('Migraciones aplicadas:')
  for (const id of applied) console.log(`  · ${id}`)
  db.close()
} catch (error) {
  console.error(`Error al migrar: ${error.message}`)
  process.exit(1)
}
