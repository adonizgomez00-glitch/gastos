import { randomUUID } from 'node:crypto'
import { ValidationError } from '../utils/errors.js'
import { sanitizeRateMicro } from '../utils/fx.js'
import { assertSupportedPair } from '../services/RateService.js'

/**
 * Rutas de tipos de cambio (SPEC-008, docs/API.md §10).
 * @param {object} deps dependencias
 * @returns {Array<{method: string, path: string, handler: Function}>} rutas
 */
export function rateRoutes(deps) {
  const { rateService, exchangeRateRepository, requireAuth, requireSpace, currentSpace } = deps

  return [
    {
      method: 'GET',
      path: '/api/rates',
      async handler(ctx) {
        await requireAuth(ctx)
        const base = (ctx.query.get('base') || 'USD').toUpperCase()
        const quote = (ctx.query.get('quote') || 'GTQ').toUpperCase()
        const rateDate = ctx.query.get('rateDate') || undefined
        const rate = await rateService.resolve({
          baseCurrency: base,
          quoteCurrency: quote,
          rateDate,
          allowFetch: ctx.query.get('fetch') !== '0'
        })
        if (!rate) {
          ctx.json(200, { base, quote, fxRateMicro: null, rateDate: null, source: null, available: false })
          return
        }
        ctx.json(200, {
          base,
          quote,
          fxRateMicro: rate.rateMicro,
          rateDate: rate.rateDate,
          source: rate.source,
          available: true
        })
      }
    },
    {
      method: 'POST',
      path: '/api/rates/refresh',
      async handler(ctx) {
        await requireAuth(ctx)
        const base = (ctx.body.base || 'USD').toUpperCase()
        const quote = (ctx.body.quote || 'GTQ').toUpperCase()
        const rate = await rateService.resolve({ baseCurrency: base, quoteCurrency: quote, allowFetch: true })
        ctx.json(200, rate
          ? { base, quote, fxRateMicro: rate.rateMicro, rateDate: rate.rateDate, source: rate.source, refreshed: true }
          : { base, quote, fxRateMicro: null, rateDate: null, source: null, refreshed: false })
      }
    },
    {
      method: 'PUT',
      path: '/api/rates/manual',
      async handler(ctx) {
        const user = await requireAuth(ctx)
        const space = currentSpace(user)
        requireSpace(ctx, space.id)

        const base = String(ctx.body.base || '').toUpperCase()
        const quote = String(ctx.body.quote || '').toUpperCase()
        // Valida el par contra el canónico GTQ/USD antes de registrar nada.
        assertSupportedPair(base, quote)

        const rateDate = String(ctx.body.rateDate || rateService.today())
        const rateMicro = sanitizeRateMicro(ctx.body.fxRateMicro)

        if (!rateMicro) {
          throw new ValidationError('La tasa manual debe ser un entero positivo en micro unidades (fxRateMicro)')
        }

        const saved = exchangeRateRepository.upsert({
          id: randomUUID(),
          rateDate,
          baseCurrency: base,
          quoteCurrency: quote,
          rateMicro,
          source: 'manual'
        })

        ctx.json(200, {
          base: saved.baseCurrency,
          quote: saved.quoteCurrency,
          fxRateMicro: saved.rateMicro,
          rateDate: saved.rateDate,
          source: saved.source
        })
      }
    }
  ]
}
