/**
 * Proveedor secundario de cotizaciones: Banguat (SOAP, días hábiles) — ADR-004.
 * Banguat publica solo días hábiles; en fines de semana la cadena de resolución
 * cae a carry-forward conservando la fecha real de la tasa (AGENT.md §16.2).
 */
export class BanguatProvider {
  /**
   * @param {object} [options] `fetchImpl` (pruebas), `timeoutMs`
   */
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 6000 } = {}) {
    this._fetch = fetchImpl
    this._timeoutMs = timeoutMs
  }

  /** @returns {string} identificador del origen grabado en `rate_source` */
  get name() {
    return 'banguat'
  }

  /**
   * Consulta el tipo de cambio de referencia del día.
   * @returns {Promise<{rateMicro: number, rateDate: string, source: string}|null>} tasa o null
   */
  async fetchRate() {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <TipoCambioDia xmlns="http://www.banguat.gob.gt/variables/ws/">
      <fechaIni>${new Date().toISOString().slice(0, 10)}T00:00:00</fechaIni>
      <fechaFin>${new Date().toISOString().slice(0, 10)}T00:00:00</fechaFin>
    </TipoCambioDia>
  </soap:Body>
</soap:Envelope>`
    try {
      const response = await this._withTimeout(this._fetch('https://www.banguat.gob.gt/variables/ws/TipoCambio.asmx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://www.banguat.gob.gt/variables/ws/TipoCambioDia"' },
        body: envelope
      }))
      if (!response.ok) return null
      const xml = await response.text()
      const rate = extractReferencia(xml)
      if (rate === null) return null
      return {
        rateMicro: Math.round(rate * 1_000_000),
        rateDate: new Date().toISOString().slice(0, 10),
        source: this.name
      }
    } catch {
      return null
    }
  }

  /** Aplica el tiempo máximo de espera al proveedor. */
  _withTimeout(promise) {
    if (!this._timeoutMs) return promise
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), this._timeoutMs))
    ])
  }
}

/**
 * Extrae `<referencia>` del SOAP de Banguat.
 * @param {string} xml respuesta SOAP
 * @returns {number|null} tasa o null si no es válida
 */
export function extractReferencia(xml) {
  const match = /<referencia>([\d.]+)<\/referencia>/i.exec(String(xml || ''))
  if (!match) return null
  const rate = Number(match[1])
  if (!Number.isFinite(rate) || rate <= 0) return null
  return rate
}
