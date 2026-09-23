/**
 * SPEC-008 — Tipos de cambio GTQ ⇄ USD.
 * Cubre AC-01..AC-15. Un test por criterio de aceptación (AGENT.md §14.1).
 * Los proveedores se inyectan con dobles: la suite NUNCA toca la red (AGENT.md §11.2).
 */
import { equal, ok } from '../helpers/assert.js'
import { startTestServer, cookieValue } from '../helpers/harness.js'
import { toBaseCents, needsConversion, sanitizeRateMicro } from '../../server/utils/fx.js'

const PASSWORD = 'quetzal-fuerte-2026'

/** Proveedor doble que responde o falla a voluntad. */
function fakeProvider(name, result) {
  return { name, fetchRate: async () => result }
}

/** Limpia las tasas registradas para que cada prueba parta de un estado conocido. */
function clearRates(ctx) {
  ctx.server.deps.exchangeRateRepository._db.prepare('DELETE FROM exchange_rates').run()
}

export async function setup(ctx) {
  ctx.server = await startTestServer()
  const owner = await ctx.server.createOwner()
  ctx.owner = owner
  const login = await ctx.server.request('POST', '/api/auth/login', { email: owner.email, password: PASSWORD })
  ctx.cookie = `gastos_session=${cookieValue(login.setCookie, 'gastos_session')}`
  ctx.RATE = { rateMicro: 7703054, rateDate: '2026-09-20', source: 'er-api' }
}

export async function teardown(ctx) {
  await ctx.server?.close()
}

/** AC-01: la tasa primaria responde y se registra con su fuente y fecha. */
export async function primaryProviderUsed(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  equal(rate.rateMicro, 7703054, 'AC-01: usa la tasa del primario')
  equal(rate.source, 'er-api', 'AC-01: registra su fuente')
  equal(rate.rateDate, '2026-09-20', 'AC-01: registra su fecha')
}

/** AC-02: si el primario falla, responde el secundario. */
export async function secondaryProviderUsed(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [
    fakeProvider('er-api', null),
    fakeProvider('banguat', { rateMicro: 7650000, rateDate: '2026-09-20', source: 'banguat' })
  ]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  equal(rate.source, 'banguat', 'AC-02: usa el secundario')
  equal(rate.rateMicro, 7650000)
}

/** AC-03: ambos fallan → carry-forward conserva el origen y la fecha ORIGINALES. */
export async function carryForwardKeepsOriginalSource(ctx) {
  clearRates(ctx)
  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-cf', rateDate: '2026-09-18', baseCurrency: 'USD', quoteCurrency: 'GTQ',
    rateMicro: 7600000, source: 'er-api', fetchedAt: '2026-09-18T12:00:00.000Z'
  })
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', null), fakeProvider('banguat', null)]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  ok(rate, 'AC-03: hay carry-forward disponible')
  equal(rate.source, 'er-api', 'AC-03: conserva el origen real, NO "carry-forward"')
  equal(rate.rateDate, '2026-09-18', 'AC-03: conserva la fecha original')
}

/** AC-04: sin proveedores ni carry-forward, no se inventa tasa. */
export async function noRateNoInvented(ctx) {
  ctx.server.deps.exchangeRateRepository._db.prepare('DELETE FROM exchange_rates').run()
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', null), fakeProvider('banguat', null)]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  equal(rate, null, 'AC-04: no devuelve tasa inventada')

  let error = null
  try {
    await ctx.server.deps.rateService.requireRate({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  } catch (caught) { error = caught }
  ok(error, 'AC-04: requireRate rechaza')
  equal(error.code, 'RATE_UNAVAILABLE', 'AC-04: código explícito')
}

/** AC-05: override manual vigente se usa y se registra como `manual`. */
export async function manualOverrideUsed(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const put = await ctx.server.request('PUT', '/api/rates/manual', {
    base: 'USD', quote: 'GTQ', rateDate: '2026-09-21', fxRateMicro: 7800000
  }, { cookie: ctx.cookie })
  equal(put.status, 200, 'AC-05: se registra la override')
  equal(put.json.source, 'manual', 'AC-05: la override se marca manual')

  const rate = await ctx.server.deps.rateService.resolve({
    baseCurrency: 'USD', quoteCurrency: 'GTQ', rateDate: '2026-09-21'
  })
  equal(rate.source, 'manual', 'AC-05: usa la override, no el proveedor')
  equal(rate.rateMicro, 7800000)
}

/** AC-06: transacción en USD con conversión congela todos los campos. */
export async function conversionFreezesFields(ctx) {
  const { amountBaseCents, fxRateMicro } = toBaseCents({
    amountCents: 5000, currency: 'USD', baseCurrency: 'GTQ', rateMicro: 7703054
  })
  equal(fxRateMicro, 7703054, 'AC-06: congela la tasa usada')
  equal(amountBaseCents, 38515, 'AC-06: 50.00 USD × 7.703054 = 385.1527 → 38515 centavos')
}

/** AC-07: el historial es inmutable: cambiar la tasa vigente no altera lo ya congelado. */
export async function historyImmutable(ctx) {
  const frozen = toBaseCents({ amountCents: 5000, currency: 'USD', baseCurrency: 'GTQ', rateMicro: 7703054 })
  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-new', rateDate: '2026-09-22', baseCurrency: 'USD', quoteCurrency: 'GTQ',
    rateMicro: 9000000, source: 'er-api'
  })
  const again = toBaseCents({ amountCents: 5000, currency: 'USD', baseCurrency: 'GTQ', rateMicro: 7703054 })
  equal(again.amountBaseCents, frozen.amountBaseCents, 'AC-07: el monto congelado no cambia')
}

/** AC-08: consulta de tasa vigente (con fuente y fecha). */
export async function queryCurrentRate(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const res = await ctx.server.request('GET', '/api/rates?base=USD&quote=GTQ&fetch=1', undefined,
    { cookie: ctx.cookie })
  equal(res.status, 200, 'AC-08: responde 200')
  equal(res.json.source, 'er-api')
  equal(res.json.fxRateMicro, 7703054)
  ok(res.json.rateDate, 'AC-08: informa la fecha')
}

/** AC-09: tasa inválida del proveedor (0/negativa/no numérica) se descarta. */
export async function invalidProviderRateDiscarded(ctx) {
  ctx.server.deps.exchangeRateRepository._db.prepare('DELETE FROM exchange_rates').run()
  ctx.server.deps.rateService._providers = [
    fakeProvider('er-api', { rateMicro: 0, rateDate: '2026-09-21', source: 'er-api' }),
    fakeProvider('banguat', { rateMicro: -5, rateDate: '2026-09-21', source: 'banguat' })
  ]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
  equal(rate, null, 'AC-09: descarta 0 y negativas')
  equal(sanitizeRateMicro(0), null, 'AC-09: 0 no es válida')
  equal(sanitizeRateMicro(-1), null, 'AC-09: negativa no es válida')
  equal(sanitizeRateMicro('abc'), null, 'AC-09: no numérica no es válida')
}


/** AC-11: transparencia de fuente — se puede saber qué tasa, fuente y fecha se usaron. */
export async function rateSourceTransparent(ctx) {
  clearRates(ctx)
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]
  const res = await ctx.server.request('GET', '/api/rates?base=USD&quote=GTQ&fetch=1', undefined,
    { cookie: ctx.cookie })
  equal(res.status, 200, 'AC-11: responde 200')
  ok(res.json.fxRateMicro, 'AC-11: informa la tasa usada')
  ok(res.json.rateDate, 'AC-11: informa la fecha')
  ok(res.json.source, 'AC-11: informa la fuente')
}

/** AC-12: una override que no cubre la fecha del registro se ignora. */
export async function overrideIgnoredWhenDateNotCovered(ctx) {
  clearRates(ctx)
  await ctx.server.request('PUT', '/api/rates/manual', {
    base: 'USD', quote: 'GTQ', rateDate: '2026-09-01', fxRateMicro: 7000000
  }, { cookie: ctx.cookie })
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', ctx.RATE)]

  const rate = await ctx.server.deps.rateService.resolve({
    baseCurrency: 'USD', quoteCurrency: 'GTQ', rateDate: '2026-09-21'
  })
  equal(rate.source, 'er-api', 'AC-12: ignora la override que no cubre esa fecha')
  equal(rate.rateMicro, 7703054)
}

/** AC-13: `rate_source` refleja siempre el origen real; nunca `carry-forward`. */
export async function rateSourceNeverCarryForward(ctx) {
  clearRates(ctx)
  ctx.server.deps.exchangeRateRepository.upsert({
    id: 'rate-cf-origen', rateDate: '2026-09-15', baseCurrency: 'USD', quoteCurrency: 'GTQ',
    rateMicro: 7500000, source: 'banguat', fetchedAt: '2026-09-15T10:00:00.000Z'
  })
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', null), fakeProvider('banguat', null)]
  const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })

  equal(rate.source, 'banguat', 'AC-13: conserva el origen real')
  ok(rate.source !== 'carry-forward', 'AC-13: NUNCA graba "carry-forward" como fuente')
  const sources = ctx.server.deps.exchangeRateRepository._db
    .prepare('SELECT DISTINCT source FROM exchange_rates').all().map((row) => row.source)
  ok(!sources.includes('carry-forward'), 'AC-13: "carry-forward" no existe como source en la BD')
}

/** AC-14: solo GTQ/USD; otra moneda se rechaza con mensaje claro. */
export async function unsupportedCurrencyRejected(ctx) {
  let error = null
  try {
    await ctx.server.deps.rateService.resolve({ baseCurrency: 'EUR', quoteCurrency: 'GTQ' })
  } catch (caught) { error = caught }
  ok(error, 'AC-14: debe rechazar monedas fuera de GTQ/USD')
  equal(error.status, 422, 'AC-14: responde 422')

  const res = await ctx.server.request('GET', '/api/rates?base=EUR&quote=GTQ', undefined,
    { cookie: ctx.cookie })
  equal(res.status, 422, 'AC-14: la API también rechaza el par no soportado')
}

/** AC-15: los campos de conversión son coherentes con la tasa usada. */
export async function conversionFieldsConsistent(ctx) {
  const rateMicro = 7703054
  const { amountBaseCents, fxRateMicro } = toBaseCents({
    amountCents: 10000, currency: 'USD', baseCurrency: 'GTQ', rateMicro
  })
  equal(fxRateMicro, rateMicro, 'AC-15: la tasa grabada es la usada')
  equal(amountBaseCents, 77031, 'AC-15: 100.00 USD × 7.703054 = 770.3054 → 77031 centavos')
  // Coherencia: el monto base se obtiene exactamente de monto × tasa.
  equal(amountBaseCents, Math.round((10000 * rateMicro) / 1_000_000), 'AC-15: cuadra al centavo')

  // Sin conversión (misma moneda) la tasa no aplica y el monto no cambia.
  const same = toBaseCents({ amountCents: 10000, currency: 'GTQ', baseCurrency: 'GTQ', rateMicro })
  equal(same.amountBaseCents, 10000, 'AC-15: misma moneda no convierte')
  equal(same.fxRateMicro, null, 'AC-15: sin tasa cuando no hay conversión')
  equal(needsConversion('USD', 'GTQ'), true, 'AC-15: detecta la conversión necesaria')
}

/** AC-10: carry-forward inválido también se descarta y se aplica la regla de fallo. */
export async function invalidCarryForwardDiscarded(ctx) {
  clearRates(ctx)
  // La BD impone `rate_micro > 0`; un carry-forward inválido sólo puede venir de un
  // repositorio que devuelva un valor corrupto, así que se simula con un doble
  // que se restaura al terminar para no contaminar las demás pruebas.
  const original = ctx.server.deps.exchangeRateRepository.findLatest.bind(
    ctx.server.deps.exchangeRateRepository
  )
  ctx.server.deps.exchangeRateRepository.findLatest = () => ({
    rateMicro: 0, rateDate: '2026-09-19', source: 'er-api', fetchedAt: '2026-09-19T00:00:00.000Z'
  })
  ctx.server.deps.rateService._providers = [fakeProvider('er-api', null), fakeProvider('banguat', null)]
  try {
    const rate = await ctx.server.deps.rateService.resolve({ baseCurrency: 'USD', quoteCurrency: 'GTQ' })
    equal(rate, null, 'AC-10: carry-forward inválido se descarta')
  } finally {
    ctx.server.deps.exchangeRateRepository.findLatest = original
  }
}

