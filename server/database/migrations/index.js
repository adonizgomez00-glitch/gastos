import { migration as m001 } from './001_init.js'

/** Migraciones en orden de ejecución. Nunca se edita una ya aplicada. */
export const MIGRATIONS = [m001]
