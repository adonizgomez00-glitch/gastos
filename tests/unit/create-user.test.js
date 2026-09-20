/** AC-13 — el alta por CLI rechaza contraseñas débiles y duplicados.
 * El script se ejecuta como proceso hijo (igual que un humano en la terminal). */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { equal } from '../helpers/assert.js'

const runFile = promisify(execFile)
const SCRIPT = new URL('../../scripts/create-user.js', import.meta.url)
const PASSWORD = 'quetzal-fuerte-2026'

export async function setup(ctx) {
  ctx.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastos-test-cli-'))
}

export async function teardown(ctx) {
  fs.rmSync(ctx.dataDir, { recursive: true, force: true })
}

/** Ejecuta el CLI en modo no interactivo con un directorio temporal. */
async function cli(ctx, env) {
  let stdout = ''
  let stderr = ''
  let code = 0
  try {
    const result = await runFile(process.execPath, [SCRIPT.pathname], {
      env: { ...process.env, GASTOS_DATA_DIR: ctx.dataDir, GASTOS_PBKDF2_ITERATIONS: '1000', ...env }
    })
    stdout = result.stdout
    stderr = result.stderr
  } catch (error) {
    code = error.code ?? 1
    stdout = error.stdout ?? ''
    stderr = error.stderr ?? ''
  }
  return { code, stdout, stderr }
}

/** AC-13: contraseña de menos de 12 caracteres rechaza el alta. */
export async function rejectsWeakPassword(ctx) {
  const out = await cli(ctx, { GASTOS_NEW_EMAIL: 'corto@example.com', GASTOS_NEW_NAME: 'Corto', GASTOS_NEW_PASSWORD: 'corta123' })
  equal(out.code, 1, 'AC-13: el script sale con error')
  const combined = `${out.stdout} ${out.stderr}`
  const hasMin = combined.includes('12') || combined.toLowerCase().includes('caracteres')
  equal(hasMin, true, 'AC-13: el mensaje explica el mínimo de caracteres')
}

/** Contraseña válida crea el usuario y el duplicado falla. */
export async function createsOwnerOnce(ctx) {
  const first = await cli(ctx, { GASTOS_NEW_EMAIL: 'dueno@example.com', GASTOS_NEW_NAME: 'Dueño', GASTOS_NEW_PASSWORD: PASSWORD })
  equal(first.code, 0, 'alta válida sale con éxito')
  const second = await cli(ctx, { GASTOS_NEW_EMAIL: 'dueno@example.com', GASTOS_NEW_NAME: 'Otro', GASTOS_NEW_PASSWORD: PASSWORD })
  equal(second.code, 1, 'email duplicado falla')
  const combined = `${second.stdout} ${second.stderr}`
  equal(combined.includes('Ya existe'), true, 'duplicado: mensaje claro')
}
