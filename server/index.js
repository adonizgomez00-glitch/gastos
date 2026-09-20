import http from 'node:http'
import { bootstrap } from './bootstrap.js'

const { config, logger, app, db } = bootstrap()
const server = http.createServer(app)

server.listen(config.port, config.host, () => {
  logger.info(`escuchando en http://${config.host}:${config.port} (prefijo público: ${config.basePath})`)
})

function shutdown(signal) {
  logger.info(`señal ${signal}: cerrando`)
  server.close(() => {
    try { db.close() } catch { /* conexión ya cerrada */ }
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
