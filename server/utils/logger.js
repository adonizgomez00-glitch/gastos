const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

/**
 * Logger mínimo. Regla I-12: NUNCA se registran montos, descripciones,
 * emails, tokens ni contraseñas.
 * @param {object} [options]
 * @param {string} [options.level] nivel mínimo a registrar
 * @param {(line: string) => void} [options.sink] destino (por defecto stdout)
 */
export function makeLogger({ level = 'info', sink } = {}) {
  const min = LEVELS[level] ?? LEVELS.info
  const write = sink || ((line) => process.stdout.write(`${line}\n`))

  function emit(lvl, message) {
    if (LEVELS[lvl] < min) return
    write(`${new Date().toISOString()} [${lvl.toUpperCase()}] ${message}`)
  }

  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m)
  }
}
