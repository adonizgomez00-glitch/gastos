import { migration as m001 } from './001_init.js'
import { migration as m002 } from './002_cuentas.js'
import { migration as m003 } from './003_categorias.js'
import { migration as m004 } from './004_exchange_rates.js'

import { migration as m005 } from './005_auditoria_transacciones.js'

/** Migraciones en orden de ejecución. Nunca se edita una ya aplicada. */
export const MIGRATIONS = [m001, m002, m003, m004, m005]
