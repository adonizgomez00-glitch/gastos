#!/usr/bin/env node
/**
 * check-docs-consistency.js — Verifica que CHECKPOINT.md y docs/Context_live.md
 * no se contradigan entre si (AGENT.md §13.4 y §13.5).
 *
 * Reglas aplicadas:
 *   R1  Lista blanca de claves compartidas -> valores identicos en ambos documentos.
 *   R2  Verde = la realidad medida (systemctl, ss, health, config de nginx).
 *   R3  Si CHECKPOINT afirma despliegue, el health debe responder y Context_live no puede estar stale (>24 h).
 *   R4  Prohibiciones cruzadas: Context_live no habla de proyecto; CHECKPOINT no habla de infraestructura.
 *
 * Uso: npm run check:docs  (sale 0 si todo es coherente; 1 con el detalle del conflicto)
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHECKPOINT = path.join(ROOT, 'CHECKPOINT.md')
const LIVE = path.join(ROOT, 'docs', 'Context_live.md')
const VHOSTS_DIR = '/etc/nginx/sites-enabled'
const PORT = Number(process.env.GASTOS_PORT || 8100)
const STALE_HOURS = 24

const SHARED_KEYS = ['servicio', 'puerto interno', 'url publica', 'url pública', 'hostname']
const LIVE_FORBIDDEN = [
  { re: /^#{1,6}\s+.*(pr[oó]ximos?\s+paso|m[oó]dulos?|tests?)/im, why: 'Context_live no debe tener secciones de proyecto (próximo paso / módulos / tests)' },
  { re: /[Uu]ltima\s+actualizaci[oó]n/i, why: 'Context_live debe usar "Generado el", no "Última actualización"' }
]
const CHECKPOINT_FORBIDDEN = [
  { re: /\b8100\b|127\.0\.0\.1|localhost:|https?:\/\//, why: 'CHECKPOINT no debe contener puertos, IPs ni URLs (son del Context_live)' },
  { re: /systemctl|tailscale|nginx|\bFunnel\b|--bg|sites-enabled/i, why: 'CHECKPOINT no debe contener mecanismos de infraestructura (nginx, tailscale, systemd)' },
  { re: /(?<!ver )docs\/Context_live\.md\s*$\s*\n\s*\|?\s*(Activo|Desplegado)/im, why: 'CHECKPOINT no debe afirmar estado runtime' },
  { re: /[Uu]ltima\s+actualizaci[oó]n/i, why: 'CHECKPOINT debe usar "Último checkpoint de contexto", no "Última actualización"' }
]

const errors = []
const warnings = []
const notes = []
const ok = []
const fail = (m) => errors.push(m)

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

/** Extrae pares clave -> valor de todas las tablas markdown del documento. */
function parseTables(md) {
  const map = new Map()
  for (const line of md.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 4) continue
    const key = cells[1].replace(/\*\*/g, '').trim().toLowerCase()
    const value = cells[2].replace(/\*\*/g, '').trim()
    if (!key || /^-+$/.test(key) || key === 'servicio' && /^-+$/.test(value)) continue
    if (!key || value === '') continue
    map.set(key, value)
  }
  return map
}

function activeState(unit) {
  try {
    const load = execFileSync('systemctl', ['show', unit, '-p', 'LoadState', '--value'], { encoding: 'utf8' }).trim()
    if (load === 'not-found' || load === '') return 'no-existe'
    const state = execFileSync('systemctl', ['show', unit, '-p', 'ActiveState', '--value'], { encoding: 'utf8' }).trim()
    return state || 'inactive'
  } catch { return 'no-existe' }
}

function portListening(port) {
  try {
    const out = execFileSync('bash', ['-lc', `ss -tlnH 2>/dev/null | grep -c ':${port} ' || true`], { encoding: 'utf8' })
    return Number(out.trim()) > 0
  } catch { return false }
}

function healthStatus(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ code: res.statusCode, body }))
    })
    req.on('error', () => resolve({ code: 0, body: '' }))
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, body: '' }) })
  })
}

/** /gastos/ declarado como location en algun vhost habilitado. */
function locationDeclared() {
  try {
    const files = fs.readdirSync(VHOSTS_DIR).map((f) => path.join(VHOSTS_DIR, f))
    return files.some((f) => /location\s+\/gastos\/?\s*\{/.test(readIfExists(f) || ''))
  } catch { return false }
}

function parseGeneratedAt(md) {
  const m = md.match(/Generado el\*{0,2}\s*:?\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
  if (!m) return null
  const iso = `${m[1]}T${m[2] || '00:00'}:00`
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? new Date(t) : null
}

function parseDeployClaim(md, tables) {
  const value = (tables.get('despliegue') || '').toLowerCase()
  if (!value) return null
  if (value.includes('pendiente') || value.startsWith('no ')) return false
  return true
}

async function main() {
  const checkpoint = readIfExists(CHECKPOINT)
  if (!checkpoint) {
    console.error('ERROR: no existe CHECKPOINT.md (documento obligatorio)'); process.exit(1)
  }
  const live = readIfExists(LIVE)

  const cpTables = parseTables(checkpoint)
  const liveTables = live ? parseTables(live) : new Map()

  // --- R1: claves compartidas ---
  const sharedChecked = []
  for (const key of SHARED_KEYS) {
    const a = cpTables.get(key)
    const b = liveTables.get(key)
    if (a === undefined || b === undefined) continue
    sharedChecked.push(key)
    if (a.toLowerCase() !== b.toLowerCase()) {
      fail(`R1 clave compartida "${key}" con valores distintos: CHECKPOINT="${a}" vs Context_live="${b}"`)
    }
  }
  ok.push(`R1 claves compartidas comparadas: ${sharedChecked.length ? sharedChecked.join(', ') : 'ninguna presente en ambos (correcto: no deben compartirse)'}`)

  // --- R4: prohibiciones cruzadas ---
  if (live) {
    for (const rule of LIVE_FORBIDDEN) {
      if (rule.re.test(live)) fail(`R4 ${rule.why}`)
    }
  }
  for (const rule of CHECKPOINT_FORBIDDEN) {
    if (rule.re.test(checkpoint)) fail(`R4 ${rule.why}`)
  }
  if (!errors.some((e) => e.startsWith('R4'))) ok.push('R4 prohibiciones cruzadas: sin violaciones')

  // --- R2: realidad medida ---
  const state = activeState('gastos')
  const listening = portListening(PORT)
  const health = await healthStatus(PORT)
  const locationOk = locationDeclared()
  const reality = [
    `gastos.service=${state}`, `puerto ${PORT}=${listening ? 'escuchando' : 'libre'}`,
    `health=${health.code || 'sin respuesta'}`, `location /gastos/=${locationOk ? 'presente' : 'ausente'}`
  ]
  ok.push(`R2 realidad medida: ${reality.join(' · ')}`)

  // --- Context_live: frescura y contraste ---
  let generatedAt = null
  if (live) {
    generatedAt = parseGeneratedAt(live)
    if (!generatedAt) {
      fail('R3 docs/Context_live.md no declara "Generado el" (no se puede evaluar frescura)')
    } else {
      const hours = (Date.now() - generatedAt.getTime()) / 3_600_000
      if (hours > STALE_HOURS) warnings.push(`R3 docs/Context_live.md está stale (${hours.toFixed(1)} h > ${STALE_HOURS} h): regenerá con npm run context:live`)
      else ok.push(`R3 Context_live fresco (${hours.toFixed(1)} h)`)
    }
    const liveState = (liveTables.get('unidad systemd') || '')
    if (liveState && /no existe|inactive/.test(liveState) && state === 'active') {
      fail(`R2 contradicción de estado: Context_live dice "${liveState}" pero systemctl reporta "active"`)
    }
    if (liveState && /active/.test(liveState) && state !== 'active') {
      fail(`R2 contradicción de estado: Context_live dice "${liveState}" pero systemctl reporta "${state}"`)
    }
  } else {
    notes.push('docs/Context_live.md no existe (normal antes del primer `npm run context:live`)')
  }

  // --- R3: afirmaciones de despliegue ---
  const claim = parseDeployClaim(checkpoint, cpTables)
  if (claim === true) {
    if (health.code !== 200) fail(`R3 CHECKPOINT afirma despliegue pero el health interno no responde 200 (obtenido: ${health.code || 'sin respuesta'})`)
    else ok.push('R3 despliegue afirmado y health 200 verificado')
    if (!live) fail('R3 CHECKPOINT afirma despliegue pero no existe docs/Context_live.md')
    else if (generatedAt && (Date.now() - generatedAt.getTime()) / 3_600_000 > STALE_HOURS) {
      fail('R3 CHECKPOINT afirma despliegue y docs/Context_live.md está stale')
    }
  } else if (claim === false) {
    ok.push('R3 despliegue declarado pendiente (coherente con servicio inexistente)')
    if (state === 'active') warnings.push(`R2 el servicio está activo pero CHECKPOINT declara el despliegue pendiente: actualizá CHECKPOINT.md`)
  } else {
    warnings.push('R3 no se encontró la fila "Despliegue" en CHECKPOINT.md (agregala para poder verificar)')
  }

  // --- Salida ---
  console.log('\n=== check:docs — consistencia CHECKPOINT.md <-> docs/Context_live.md ===\n')
  for (const line of ok) console.log(`  OK    ${line}`)
  for (const line of warnings) console.log(`  WARN  ${line}`)
  for (const line of notes) console.log(`  INFO  ${line}`)
  for (const line of errors) console.log(`  FAIL  ${line}`)
  console.log('')
  if (errors.length) {
    console.log(`RESULTADO: ${errors.length} contradicción(es) detectada(s). Corregí el documento dueño del dato (AGENT.md §13.3).\n`)
    process.exit(1)
  }
  console.log(`RESULTADO: coherente (${warnings.length} aviso(s)).\n`)
  process.exit(0)
}

main()
