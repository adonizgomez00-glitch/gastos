#!/usr/bin/env node
/**
 * run-all.js — corredor de pruebas propio (sin dependencias).
 * Descubre tests/*\/​*.test.js (excepto helpers), ejecuta setup + cada test + teardown por archivo,
 * y reporta en verde/rojo. Sale con código 1 si algo falla.
 * Uso: npm test
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TESTS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '.')
const START = Date.now()
let passed = 0
let failed = 0
const failures = []

function collect(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'helpers' || entry.name === 'e2e') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...collect(full))
    else if (entry.name.endsWith('.test.js')) found.push(full)
  }
  return found.sort()
}

const files = collect(TESTS_DIR)
console.log(`tests: ${files.length} archivo(s)\n`)

for (const file of files) {
  const rel = path.relative(TESTS_DIR, file)
  let mod
  try {
    mod = await import(pathToFileURL(file).href)
  } catch (error) {
    failed += 1
    failures.push({ rel, name: '(import)', error })
    console.log(`❌ ${rel} — no se pudo importar: ${error.message}`)
    continue
  }
  const ctx = {}
  try {
    if (typeof mod.setup === 'function') await mod.setup(ctx)
  } catch (error) {
    failed += 1
    failures.push({ rel, name: 'setup', error })
    console.log(`❌ ${rel} setup — ${error.message}`)
    continue
  }
  for (const [name, fn] of Object.entries(mod)) {
    if (name === 'setup' || name === 'teardown' || typeof fn !== 'function') continue
    const started = Date.now()
    try {
      await fn(ctx)
      passed += 1
      console.log(`  ✅ ${rel} › ${name} (${Date.now() - started}ms)`)
    } catch (error) {
      failed += 1
      failures.push({ rel, name, error })
      console.log(`  ❌ ${rel} › ${name} — ${error.message}`)
    }
  }
  try {
    if (typeof mod.teardown === 'function') await mod.teardown(ctx)
  } catch (error) {
    console.log(`  ⚠️  ${rel} teardown — ${error.message}`)
  }
}

const seconds = ((Date.now() - START) / 1000).toFixed(1)
console.log(`\n${passed} en verde · ${failed} en rojo · ${seconds}s`)
if (failures.length) {
  console.log('\nFallos:')
  for (const { rel, name, error } of failures) {
    console.log(`\n— ${rel} › ${name}\n${error.stack || error.message}`)
  }
  process.exit(1)
}
console.log('\n✅ suite completa')
