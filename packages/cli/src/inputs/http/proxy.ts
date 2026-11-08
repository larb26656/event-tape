import { randomUUID } from 'node:crypto'
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Recorder } from '@event-tape/sdk'
import { captureBody, MAX_CAPTURE_BYTES, type CaptureBudget } from './body.js'
import { capturedHeaders, forwardingHeaders } from './headers.js'
import type { HttpOptions } from './options.js'

interface ProxyContext {
  options: HttpOptions
  recorder: Recorder
  report(error: Error): void
  active: Set<(incomplete: boolean) => boolean>
  budget: CaptureBudget
  blocked: Set<string> | undefined
  isStopping(): boolean
}

export function proxy(request: IncomingMessage, response: ServerResponse, context: ProxyContext) {
  const { options, recorder, report, active, budget, blocked } = context
  const requestId = randomUUID()
  let requestDone = false
  let responseDone = false
  let failed = false
  let upstreamResponse: IncomingMessage | undefined
  let timer: NodeJS.Timeout
  const capture = (kind: 'request' | 'response', fields: Record<string, unknown>) => {
    const body = captureBody(options.bodyLimit, budget)
    let done = false
    return {
      add(chunk: Buffer) {
        if (!done && !body.add(chunk)) {
          report(new Error(`HTTP capture exceeded ${MAX_CAPTURE_BYTES} aggregate retained bytes`))
          abort('CAPTURE_LIMIT', false)
        }
      },
      finish(incomplete: boolean) {
        if (done) return
        done = true
        try {
          recorder.record({
            source: 'http', direction: kind,
            payload: {
              requestId, kind, ...fields,
              body: body.finish(incomplete),
            },
          })
        } catch (error) {
          report(error instanceof Error ? error : new Error(String(error)))
        }
        if (kind === 'request') requestDone = true
        else responseDone = true
        settle()
      },
    }
  }
  const reqCapture = capture('request', {
    startedAt: new Date().toISOString(), method: request.method ?? '', url: request.url ?? '',
    headers: capturedHeaders(request, blocked),
  })
  let resCapture: { add(chunk: Buffer): void; finish(incomplete: boolean): void } | undefined
  const upstream = options.upstream!
  // The configured origin alone selects the destination, even for absolute-form requests.
  let path = request.url ?? '/'
  if (!path.startsWith('/')) {
    try {
      const parsed = new URL(path)
      path = parsed.pathname + parsed.search
    } catch { path = '/' }
  }
  const headers = forwardingHeaders(request)
  headers.host = upstream.host
  const outgoing = (upstream.protocol === 'https:' ? httpsRequest : httpRequest)({
    protocol: upstream.protocol, hostname: upstream.hostname.replace(/^\[|\]$/g, ''), port: upstream.port || undefined,
    method: request.method, path, headers, agent: false,
  })
  const touch = () => {
    if (failed) return
    clearTimeout(timer)
    timer = setTimeout(() => abort('ETIMEDOUT', true), options.idleTimeout)
  }
  const settle = () => {
    if (requestDone && responseDone && outgoing.writableFinished && response.writableFinished) {
      clearTimeout(timer)
      active.delete(force)
    }
  }
  const force = () => { abort('SHUTDOWN', false); return true }
  const abort = (code: string, timeout: boolean) => {
    if (failed) return
    failed = true
    clearTimeout(timer)
    reqCapture.finish(true)
    resCapture?.finish(true)
    responseDone = true
    active.delete(force)
    try {
      recorder.record({
        source: 'http', direction: 'error',
        payload: { requestId, kind: 'error', startedAt: new Date().toISOString(), code },
      })
    } catch (error) {
      report(error instanceof Error ? error : new Error(String(error)))
    }
    request.unpipe(outgoing)
    outgoing.destroy()
    upstreamResponse?.destroy()
    if (!response.destroyed) {
      if (!response.headersSent) response.writeHead(timeout ? 504 : 502, { connection: 'close' }).end()
      else response.destroy()
    }
    request.resume()
  }
  active.add(force)
  touch()
  request.on('data', (chunk: Buffer) => { touch(); reqCapture.add(chunk) })
  request.on('end', () => reqCapture.finish(false))
  request.on('aborted', () => abort('CLIENT_ABORTED', false))
  request.on('error', () => abort('CLIENT_ERROR', false))
  request.on('close', () => { if (!request.complete) abort('CLIENT_ABORTED', false) })
  response.on('close', () => { if (!response.writableFinished) abort('CLIENT_ABORTED', false) })
  response.on('drain', touch)
  outgoing.on('drain', touch)
  outgoing.on('finish', () => { touch(); settle() })
  response.on('finish', () => { touch(); settle(); if (context.isStopping()) request.socket.end() })
  outgoing.on('error', (error: NodeJS.ErrnoException) => abort(error.code ?? 'UPSTREAM_ERROR', false))
  outgoing.on('response', (incoming) => {
    if (failed) { incoming.destroy(); return }
    touch()
    upstreamResponse = incoming
    resCapture = capture('response', {
      startedAt: new Date().toISOString(), status: incoming.statusCode ?? 502,
      headers: capturedHeaders(incoming, blocked),
    })
    response.writeHead(incoming.statusCode ?? 502, forwardingHeaders(incoming))
    incoming.on('data', (chunk: Buffer) => { touch(); resCapture!.add(chunk) })
    incoming.on('end', () => resCapture!.finish(false))
    incoming.on('aborted', () => abort('UPSTREAM_ABORTED', false))
    incoming.on('error', () => abort('UPSTREAM_ERROR', false))
    incoming.on('close', () => { if (!incoming.complete) abort('UPSTREAM_ABORTED', false) })
    incoming.pipe(response)
  })
  request.pipe(outgoing)
}
