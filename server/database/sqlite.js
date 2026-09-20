import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Abre la base de datos con los PRAGMA obligatorios (docs/DATABASE.md §1).
 * ÚNICO lugar autorizado a instanciar DatabaseSync (regla AR-06).
 * @param {string} file ruta del archivo SQLite
 * @returns {DatabaseSync} conexión lista para usar
 */
export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec('PRAGMA busy_timeout=5000')
  return db
}

/**
 * Ejecuta una función dentro de una transacción.
 * @template T
 * @param {DatabaseSync} db conexión
 * @param {() => T} work trabajo a ejecutar
 * @returns {T} resultado del trabajo
 */
export function withTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
