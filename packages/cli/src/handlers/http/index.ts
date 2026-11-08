import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { Recorder } from '@event-tape/sdk'
import type { HandlerDefinition, RunningHandler } from '../handler.js'
import { captureBody, MAX_CAPTURE_BYTES } from './body.js'
import { capturedHeaders, DEFAULT_REDACTED_HEADERS } from './headers.js'
import { resolveOptions, type HttpOptions } from './options.js'
import { proxy } from './proxy.js'

const MAX_REQUESTS = 128

async function start(options: HttpOptions, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningHandler> {
  const blocked = options.redact
    ? new Set([...DEFAULT_REDACTED_HEADERS, ...options.redactHeaders])
    : undefined
  const sockets = new Set<Socket>()
  const active = new Set<(incomplete: boolean) => boolean>()
  const budget = { retained: 0 }
  let stopping = false
  let forced = false
  let reported = false
  let stopPromise: Promise<void> | undefined
  const report = (error: Error) => {
    if (reported) return
    reported = true
    fatal(error)
  }

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (stopping || reported) {
      response.writeHead(503, { connection: 'close' }).end()
      request.resume()
      return
    }
    if (active.size >= MAX_REQUESTS) {
      response.writeHead(503, { connection: 'close' }).end()
      request.resume()
      report(new Error(`HTTP capture exceeded ${MAX_REQUESTS} in-flight requests`))
      return
    }
    if (options.mode === 'proxy') {
      proxy(request, response, { options, recorder, report, active, budget, blocked, isStopping: () => stopping })
      return
    }
    const requestId = randomUUID()
    const startedAt = new Date().toISOString()
    const method = request.method ?? ''
    const url = request.url ?? ''
    const headers = capturedHeaders(request, blocked)
    const body = captureBody(options.bodyLimit, budget)
    let finished = false

    const finish = (incomplete: boolean): boolean => {
      if (finished) return false
      finished = true
      active.delete(finish)
      try {
        recorder.record({
          source: 'http',
          direction: 'request',
          payload: {
            requestId, kind: 'request', startedAt, method, url, headers,
            body: body.finish(incomplete),
          },
        })
        return true
      } catch (error) {
        report(error instanceof Error ? error : new Error(String(error)))
        return false
      }
    }
    active.add(finish)
    request.on('data', (chunk: Buffer) => {
      if (!finished && !body.add(chunk)) {
        finish(true)
        if (!response.headersSent) response.writeHead(503, { connection: 'close' }).end()
        request.destroy()
        report(new Error(`HTTP capture exceeded ${MAX_CAPTURE_BYTES} aggregate retained bytes`))
      }
    })
    request.on('end', () => {
      const accepted = finish(false)
      if (!response.destroyed && !response.headersSent)
        response.writeHead(accepted ? 204 : 503).end()
    })
    request.on('aborted', () => { finish(true) })
    request.on('error', () => { finish(true) })
    request.on('close', () => {
      if (!request.complete) finish(true)
    })
    request.setTimeout(options.idleTimeout, () => {
      finish(true)
      if (!response.headersSent) response.writeHead(408, { connection: 'close' }).end()
      request.destroy()
    })
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    if (stopping || sockets.size > MAX_REQUESTS) {
      socket.destroy()
      if (!stopping) report(new Error(`HTTP capture exceeded ${MAX_REQUESTS} connections`))
    }
  })
  if (options.mode === 'capture') server.setTimeout(options.idleTimeout, (socket) => socket.destroy())
  server.on('connect', (_request, socket) => {
    socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n')
  })
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n')
  })

  const listening = Promise.withResolvers<void>()
  server.once('error', listening.reject)
  server.listen(options.port, options.host, () => {
    server.off('error', listening.reject)
    server.on('error', report)
    listening.resolve()
  })
  await listening.promise
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('HTTP listener did not expose an address')
  }
  const displayHost = address.family === 'IPv6' ? `[${address.address}]` : address.address

  return {
    address: `http://${displayHost}:${address.port}`,
    stop() {
      if (!stopPromise) {
        stopping = true
        const closed = Promise.withResolvers<void>()
        stopPromise = closed.promise
        server.close((error) => error ? closed.reject(error) : closed.resolve())
        server.closeIdleConnections()
      }
      return stopPromise
    },
    forceStop() {
      if (forced) return
      forced = true
      stopping = true
      // Finalize synchronously before the session owner is allowed to close Recorder.
      for (const finish of active) finish(true)
      for (const socket of sockets) socket.destroy()
      if (!stopPromise) {
        const closed = Promise.withResolvers<void>()
        stopPromise = closed.promise
        server.close((error) => error ? closed.reject(error) : closed.resolve())
        // A force-only shutdown need not have a caller awaiting the close callback.
        void stopPromise.catch(() => {})
      }
    },
  }
}


export const httpHandler: HandlerDefinition<HttpOptions> = {
  name: 'http',
  description: 'Record HTTP/1.1 requests directly or proxy them to an upstream',
  presets: { otel: { mode: 'proxy' } },
  configureOptions(command) {
    command
      .option('--preset <name>', 'builtin preset (otel)')
      .option('--preset-file <file>', 'plain YAML preset file')
      .option('--mode <mode>', 'HTTP mode: capture or proxy (default: capture)')
      .option('--upstream <url>', 'HTTP or HTTPS upstream URL (required in proxy mode)')
      .option('--host <address>', 'listen address (default: 127.0.0.1)')
      .option('--port <port>', 'listen port (default: 0, chosen by the OS)')
      .option('--body-limit <bytes>', 'retained body prefix in bytes (default: 65536)')
      .option('--idle-timeout <ms>', 'request idle timeout in milliseconds (default: 30000)')
      .option('--redact', 'enable header redaction')
      .option('--no-redact', 'retain sensitive header values')
      .option('--redact-header <name>', 'add a header name to the default redaction list', (name: string, names: string[]) => [...(names ?? []), name])
  },
  resolve: resolveOptions,
  start,
}
