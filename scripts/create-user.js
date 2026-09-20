#!/usr/bin/env node
/**
 * create-user.js — alta del usuario dueño (no hay registro público: SPEC-001 §4.2).
 * Uso interactivo:  npm run user:create
 * Uso no interactivo: GASTOS_NEW_EMAIL=… GASTOS_NEW_NAME=… GASTOS_NEW_PASSWORD=… npm run user:create
 */
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { bootstrap } from '../server/bootstrap.js'

const MIN_LENGTH = Number(process.env.GASTOS_MIN_PASSWORD_LENGTH || 12)

function mask(value) {
  return `${value.length} caracteres`
}

async function askInteractive() {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  try {
    const email = (await rl.question('Email del dueño: ')).trim()
    const name = (await rl.question('Nombre: ')).trim()
    const password = await rl.question(`Contraseña (mínimo ${MIN_LENGTH} caracteres): `)
    const confirm = await rl.question('Repetir contraseña: ')
    if (password !== confirm) throw new Error('Las contraseñas no coinciden')
    return { email, name, password }
  } finally {
    rl.close()
  }
}

async function main() {
  const fromEnv = process.env.GASTOS_NEW_EMAIL && process.env.GASTOS_NEW_PASSWORD
  const data = fromEnv
    ? {
        email: process.env.GASTOS_NEW_EMAIL,
        name: process.env.GASTOS_NEW_NAME || process.env.GASTOS_NEW_EMAIL,
        password: process.env.GASTOS_NEW_PASSWORD
      }
    : await askInteractive()

  const { config, authService, db } = bootstrap()
  try {
    const user = await authService.createOwner(data)
    console.log('✅ Usuario dueño creado')
    console.log(`   id: ${user.id}`)
    console.log(`   email: ${user.email}`)
    console.log(`   nombre: ${user.name}`)
    console.log(`   contraseña: ${mask(data.password)} (no se guarda en claro)`)
    console.log(`   base de datos: ${config.dbFile}`)
  } finally {
    db.close()
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`)
  process.exit(1)
})
