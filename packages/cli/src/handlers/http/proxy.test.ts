import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, request, type IncomingMessage, type RequestOptions, type Server } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const cli = process.env.EVENT_TAPE_TEST_CLI ?? fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-proxy-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

type Body = { encoding: string; data: string; retainedBytes: number; truncated: boolean; incomplete: boolean }
type Capture = { kind: string; requestId: string; startedAt: string; method?: string; url?: string; status?: number; headers?: Record<string, unknown>; body?: Body }
type Session = { child: ChildProcessWithoutNullStreams; address: string; exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }> }

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected TCP address')
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server) {
  server.closeAllConnections()
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  server.close((error) => error ? reject(error) : resolve())
  await promise
}

async function start(file: string, upstream: string, args: string[] = [], env: NodeJS.ProcessEnv = {}, shutdownTimeout?: string): Promise<Session> {
  const sessionOptions = shutdownTimeout ? ['--shutdown-timeout', shutdownTimeout] : []
  const child = spawn(process.execPath, [cli, 'record', '--output', file, ...sessionOptions, 'http', '--mode', 'proxy', '--upstream', upstream, '--host', '127.0.0.1', '--port', '0', ...args], { cwd: dir, env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const exit = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  child.once('error', exit.reject)
  child.once('exit', (code, signal) => exit.resolve({ code, signal }))
  const exited = exit.promise
  const listening = Promise.withResolvers<string>()
  const timer = setTimeout(() => listening.reject(new Error(`CLI did not start: ${stdout} ${stderr}`)), 5000)
  child.stdout.on('data', () => {
    const match = stdout.match(/Listening: (http:\/\/127\.0\.0\.1:\d+)/)
    if (match && stdout.includes(`Recording: ${file}`)) { clearTimeout(timer); listening.resolve(match[1]!) }
  })
  void exited.then(({ code }) => { clearTimeout(timer); listening.reject(new Error(`CLI exited ${code}: ${stdout} ${stderr}`)) }, listening.reject)
  const address = await listening.promise.catch((error: unknown) => { child.kill('SIGKILL'); throw error })
  return { child, address, exited }
}

async function stop(session: Session) {
  session.child.kill('SIGINT')
  const timeout = AbortSignal.timeout(5000)
  const result = await Promise.race([session.exited, once(timeout, 'abort').then(() => { throw new Error('CLI did not stop') })])
  expect(result).toEqual({ code: 0, signal: null })
}

async function captures(file: string): Promise<Capture[]> {
  const text = await readFile(file, 'utf8')
  expect(text.endsWith('\n')).toBe(true)
  return text.trimEnd().split('\n').map((line, index) => {
    const event = JSON.parse(line) as { version: number; seq: number; payload: Capture }
    expect(event).toMatchObject({ version: 1, seq: index + 1 })
    expect(event.payload.requestId).toBeTruthy()
    expect(Number.isNaN(Date.parse(event.payload.startedAt))).toBe(false)
    return event.payload
  })
}

async function bytes(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function response(address: string, options: RequestOptions, body?: Buffer | string): Promise<IncomingMessage> {
  const { promise, resolve, reject } = Promise.withResolvers<IncomingMessage>()
  const req = request(address, options, resolve)
  req.on('error', reject)
  req.end(body)
  return promise
}

describe('proxy executable', () => {
  it('removes hop-by-hop and connection-nominated headers in both directions while recording them', async () => {
    const received = Promise.withResolvers<IncomingMessage['headers']>()
    const upstream = createServer((req, res) => {
      received.resolve(req.headers)
      req.resume()
      res.writeHead(200, { connection: 'close, X-Response-Hop', 'x-response-hop': 'private-response', 'x-visible': 'response-visible' })
      res.end('ok')
    })
    const origin = await listen(upstream)
    const file = join(dir, 'hop-headers.jsonl')
    const session = await start(file, origin)
    try {
      const res = await response(session.address, {
        headers: { connection: 'close, X-Request-Hop', 'x-request-hop': 'private-request', 'x-visible': 'request-visible', 'proxy-authorization': 'secret' },
      })
      expect((await bytes(res)).toString()).toBe('ok')
      const headers = await received.promise
      expect(headers['x-request-hop']).toBeUndefined()
      expect(headers['proxy-authorization']).toBeUndefined()
      expect(headers['x-visible']).toBe('request-visible')
      expect(res.headers['x-response-hop']).toBeUndefined()
      expect(res.headers['x-visible']).toBe('response-visible')
      await stop(session)
      const events = await captures(file)
      expect(events.find((event) => event.kind === 'request')?.headers?.['x-request-hop']).toBe('private-request')
      expect(events.find((event) => event.kind === 'response')?.headers?.['x-response-hop']).toBe('private-response')
    } finally {
      session.child.kill('SIGKILL')
      await close(upstream)
    }
  })

  it('streams both directions before the sender finishes and records bounded, redacted copies', async () => {
    const firstUpload = Promise.withResolvers<Buffer>()
    const receivedUpload = Promise.withResolvers<{ method: string | undefined; url: string | undefined; headers: IncomingMessage['headers']; body: Buffer }>()
    const finishResponse = Promise.withResolvers<void>()
    const upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => { chunks.push(chunk); firstUpload.resolve(Buffer.concat(chunks)) })
      await once(req, 'end')
      receivedUpload.resolve({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(201, { 'set-cookie': ['a=one; Path=/', 'b=two; Path=/'], 'x-secret': 'response-secret' })
      res.write(Buffer.from([0xff, 0, 0x80]))
      await finishResponse.promise
      res.end(Buffer.from([1, 2, 3]))
    })
    const origin = await listen(upstream)
    const file = join(dir, 'stream.jsonl')
    const session = await start(file, origin, ['--body-limit', '4', '--redact-header', 'X-Secret'])
    try {
      const req = request(session.address, { method: 'PATCH', path: '/upload?q=one%20two', headers: { authorization: 'Bearer upstream-secret', cookie: 'session=client-secret', 'X-Secret': 'custom-secret' } })
      const received = once(req, 'response', { signal: AbortSignal.timeout(5000) })
      req.write(Buffer.from([0xff, 0, 0x80]))
      const uploadTimeout = AbortSignal.timeout(3000)
      expect(await Promise.race([firstUpload.promise, once(uploadTimeout, 'abort').then(() => { throw new Error('Upload was buffered') })])).toEqual(Buffer.from([0xff, 0, 0x80]))
      req.end(Buffer.from([1, 2, 3]))
      const observed = await receivedUpload.promise
      expect(observed).toMatchObject({ method: 'PATCH', url: '/upload?q=one%20two', headers: { authorization: 'Bearer upstream-secret', cookie: 'session=client-secret', 'x-secret': 'custom-secret' } })
      expect(observed.body).toEqual(Buffer.from([0xff, 0, 0x80, 1, 2, 3]))
      const [res] = await received
      expect(res.statusCode).toBe(201)
      expect(res.headers['set-cookie']).toEqual(['a=one; Path=/', 'b=two; Path=/'])
      expect(res.headers['x-secret']).toBe('response-secret')
      const [first] = await once(res, 'data', { signal: AbortSignal.timeout(5000) })
      expect(first).toEqual(Buffer.from([0xff, 0, 0x80]))
      const rest = bytes(res)
      finishResponse.resolve()
      expect(Buffer.concat([first, await rest])).toEqual(Buffer.from([0xff, 0, 0x80, 1, 2, 3]))
      await stop(session)
      const text = await readFile(file, 'utf8')
      for (const secret of ['upstream-secret', 'client-secret', 'custom-secret', 'response-secret', 'a=one', 'b=two']) expect(text).not.toContain(secret)
      const events = await captures(file)
      expect(events).toHaveLength(2)
      const upload = events.find((event) => event.kind === 'request')!
      const download = events.find((event) => event.kind === 'response')!
      expect(upload).toMatchObject({ method: 'PATCH', url: '/upload?q=one%20two', body: { encoding: 'base64', data: '/wCAAQ==', retainedBytes: 4, truncated: true, incomplete: false } })
      expect(download).toMatchObject({ requestId: upload.requestId, status: 201, body: { encoding: 'base64', data: '/wCAAQ==', retainedBytes: 4, truncated: true, incomplete: false } })
    } finally { finishResponse.resolve(); session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('correlates concurrent exchanges regardless of completion order', async () => {
    const releaseSlow = Promise.withResolvers<void>()
    const upstream = createServer(async (req, res) => {
      const body = await bytes(req)
      if (req.url === '/slow') await releaseSlow.promise
      res.end(body)
    })
    const origin = await listen(upstream)
    const file = join(dir, 'concurrent.jsonl')
    const session = await start(file, origin)
    try {
      const inputs = ['/slow', ...Array.from({ length: 12 }, (_, index) => `/item-${index}`)]
      const send = async (path: string) => {
        const res = await response(session.address, { method: 'POST', path }, path)
        expect((await bytes(res)).toString()).toBe(path)
      }
      const slow = send('/slow')
      await Promise.all(inputs.slice(1).map(send))
      releaseSlow.resolve()
      await slow
      await stop(session)
      const events = await captures(file)
      expect(events).toHaveLength(inputs.length * 2)
      const requests = events.filter((event) => event.kind === 'request')
      expect(new Set(requests.map((event) => event.requestId)).size).toBe(inputs.length)
      for (const path of inputs) {
        const sent = requests.find((event) => event.url === path)!
        expect(sent.body).toMatchObject({ data: path, incomplete: false })
        const replies = events.filter((event) => event.kind === 'response' && event.requestId === sent.requestId)
        expect(replies).toHaveLength(1)
        expect(replies[0]!.body).toMatchObject({ data: path, incomplete: false })
      }
    } finally { releaseSlow.resolve(); session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('forwards large concurrent bodies through slow peers without truncating traffic', async () => {
    const upstream = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
        // Real socket backpressure crosses processes and cannot use fake timers.
        await delay(2)
      }
      res.end(Buffer.concat(chunks))
    })
    const origin = await listen(upstream)
    const file = join(dir, 'large.jsonl')
    const session = await start(file, origin, ['--body-limit', '32'])
    try {
      const payload = Buffer.alloc(512 * 1024, 0xab)
      await Promise.all(Array.from({ length: 8 }, async (_, index) => {
        const res = await response(session.address, { method: 'POST', path: `/large-${index}` }, payload)
        const chunks: Buffer[] = []
        for await (const chunk of res) {
          chunks.push(Buffer.from(chunk))
          await delay(2)
        }
        expect(Buffer.concat(chunks)).toEqual(payload)
      }))
      await stop(session)
      const events = await captures(file)
      expect(events).toHaveLength(16)
      for (const event of events)
        expect(event.body).toMatchObject({ retainedBytes: 32, truncated: true, incomplete: false })
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('keeps a backpressured response alive while the client makes progress', async () => {
    const payload = Buffer.alloc(8 * 1024 * 1024, 0x61)
    const upstream = createServer((_req, res) => { res.end(payload) })
    const origin = await listen(upstream)
    const file = join(dir, 'slow-forward.jsonl')
    const session = await start(file, origin, ['--body-limit', '16', '--idle-timeout', '250'])
    try {
      const res = await response(session.address, { path: '/slow-forward' })
      const chunks: Buffer[] = []
      const started = Date.now()
      for await (const chunk of res) {
        chunks.push(Buffer.from(chunk))
        await delay(10)
      }
      expect(Date.now() - started).toBeGreaterThan(250)
      expect(Buffer.concat(chunks)).toEqual(payload)
      await stop(session)
      const events = await captures(file)
      expect(events.map((event) => event.kind).sort()).toEqual(['request', 'response'])
      expect(events.find((event) => event.kind === 'response')?.body).toMatchObject({ truncated: true, incomplete: false })
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  }, 30_000)

  it('passes redirects through and never retries a failed upstream operation', async () => {
    let targetCalls = 0
    let failedCalls = 0
    const upstream = createServer((req, res) => {
      if (req.url === '/redirect') { res.writeHead(302, { location: '/target' }); res.end('redirect') }
      else if (req.url === '/target') { targetCalls++; res.end('target') }
      else if (req.url === '/fail') { failedCalls++; req.socket.destroy() }
      else res.end('healthy')
    })
    const origin = await listen(upstream)
    const file = join(dir, 'failure.jsonl')
    const session = await start(file, origin)
    try {
      const redirect = await response(session.address, { path: '/redirect' })
      expect(redirect.statusCode).toBe(302)
      expect(redirect.headers.location).toBe('/target')
      expect((await bytes(redirect)).toString()).toBe('redirect')
      const failed = await response(session.address, { method: 'POST', path: '/fail' }, 'operation')
      expect(failed.statusCode).toBe(502)
      await bytes(failed)
      const healthy = await response(session.address, { path: '/healthy' })
      expect((await bytes(healthy)).toString()).toBe('healthy')
      expect(targetCalls).toBe(0)
      expect(failedCalls).toBe(1)
      await stop(session)
      const events = await captures(file)
      const failedRequest = events.find((event) => event.kind === 'request' && event.url === '/fail')!
      expect(failedRequest).toBeDefined()
      expect(events.some((event) => event.kind === 'error' && event.requestId === failedRequest.requestId)).toBe(true)
      expect(events.some((event) => event.kind === 'response' && event.requestId === failedRequest.requestId)).toBe(false)
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('returns 504 for an idle upstream and continues serving requests', async () => {
    const upstream = createServer((req, res) => { if (req.url !== '/idle') res.end('ok') })
    const origin = await listen(upstream)
    const file = join(dir, 'timeout.jsonl')
    const session = await start(file, origin, ['--idle-timeout', '150'])
    try {
      const timedOut = await response(session.address, { path: '/idle', signal: AbortSignal.timeout(5000) })
      expect(timedOut.statusCode).toBe(504)
      await bytes(timedOut)
      const healthy = await response(session.address, { path: '/after' })
      expect((await bytes(healthy)).toString()).toBe('ok')
      await stop(session)
      const events = await captures(file)
      const sent = events.find((event) => event.kind === 'request' && event.url === '/idle')!
      expect(sent).toBeDefined()
      expect(events.some((event) => event.kind === 'error' && event.requestId === sent.requestId)).toBe(true)
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('keeps an active response alive beyond the idle interval', async () => {
    const upstream = createServer(async (_req, res) => {
      for (let index = 0; index < 5; index++) {
        res.write('x')
        // The CLI is a separate process using its real idle clock.
        await delay(70)
      }
      res.end('y')
    })
    const origin = await listen(upstream)
    const file = join(dir, 'active-stream.jsonl')
    const session = await start(file, origin, ['--idle-timeout', '250'])
    try {
      const res = await response(session.address, { path: '/active' })
      expect((await bytes(res)).toString()).toBe('xxxxxy')
      await stop(session)
      const events = await captures(file)
      expect(events.find((event) => event.kind === 'response')).toMatchObject({ body: { data: 'xxxxxy', incomplete: false } })
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('records an incomplete response when the upstream disconnects after headers', async () => {
    const disconnect = Promise.withResolvers<void>()
    const upstream = createServer(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('prefix')
      await disconnect.promise
      res.destroy()
    })
    const origin = await listen(upstream)
    const file = join(dir, 'disconnect.jsonl')
    const session = await start(file, origin)
    try {
      const res = await response(session.address, { path: '/disconnect' })
      expect(res.statusCode).toBe(200)
      const [chunk] = await once(res, 'data', { signal: AbortSignal.timeout(5000) })
      expect(chunk.toString()).toBe('prefix')
      const closed = Promise.withResolvers<void>()
      res.once('close', () => closed.resolve())
      res.on('error', () => {})
      disconnect.resolve()
      await Promise.race([closed.promise, once(AbortSignal.timeout(5000), 'abort').then(() => { throw new Error('Response did not close') })])
      expect(res.complete).toBe(false)
      await stop(session)
      const events = await captures(file)
      const sent = events.find((event) => event.kind === 'request')!
      expect(events.find((event) => event.kind === 'response')).toMatchObject({ requestId: sent.requestId, status: 200, body: { data: 'prefix', incomplete: true } })
      expect(events.some((event) => event.kind === 'error' && event.requestId === sent.requestId)).toBe(true)
    } finally { disconnect.resolve(); session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('cancels upstream work when the client disconnects', async () => {
    const upstreamClosed = Promise.withResolvers<void>()
    const upstream = createServer((_req, res) => {
      res.on('close', () => upstreamClosed.resolve())
      res.writeHead(200)
      res.write('prefix')
    })
    const origin = await listen(upstream)
    const file = join(dir, 'client-abort.jsonl')
    const session = await start(file, origin)
    try {
      const res = await response(session.address, { path: '/abort' })
      await once(res, 'data', { signal: AbortSignal.timeout(5000) })
      res.destroy()
      await Promise.race([upstreamClosed.promise, once(AbortSignal.timeout(5000), 'abort').then(() => { throw new Error('Upstream not cancelled') })])
      await stop(session)
      const events = await captures(file)
      const sent = events.find((event) => event.kind === 'request')!
      expect(events.find((event) => event.kind === 'response')).toMatchObject({ requestId: sent.requestId, body: { data: 'prefix', incomplete: true } })
      expect(events.some((event) => event.kind === 'error' && event.requestId === sent.requestId)).toBe(true)
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('finishes in-flight proxy traffic on interrupt', async () => {
    const arrived = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const upstream = createServer(async (req, res) => {
      await bytes(req)
      arrived.resolve()
      await release.promise
      res.end('complete')
    })
    const origin = await listen(upstream)
    const file = join(dir, 'graceful.jsonl')
    const session = await start(file, origin, [], {}, '3000')
    try {
      const pending = response(session.address, { method: 'POST', path: '/in-flight' }, 'request')
      await arrived.promise
      session.child.kill('SIGINT')
      release.resolve()
      const res = await pending
      expect((await bytes(res)).toString()).toBe('complete')
      expect(await session.exited).toEqual({ code: 0, signal: null })
      const events = await captures(file)
      const sent = events.find((event) => event.kind === 'request')!
      expect(sent).toMatchObject({ url: '/in-flight', body: { data: 'request', incomplete: false } })
      expect(events.find((event) => event.kind === 'response')).toMatchObject({ requestId: sent.requestId, body: { data: 'complete', incomplete: false } })
    } finally { release.resolve(); session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('fails shutdown when an in-flight upstream exceeds the total deadline', async () => {
    const arrived = Promise.withResolvers<void>()
    const upstream = createServer(() => { arrived.resolve() })
    const origin = await listen(upstream)
    const file = join(dir, 'deadline.jsonl')
    const session = await start(file, origin, ['--idle-timeout', '5000'], {}, '150')
    try {
      const pending = response(session.address, { path: '/stalled' }).catch(() => undefined)
      await arrived.promise
      session.child.kill('SIGINT')
      expect(await session.exited).toEqual({ code: 1, signal: null })
      const result = await pending
      result?.resume()
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('forwards to a trusted local HTTPS upstream', async () => {
    const key = join(dir, 'fixture.key')
    const cert = join(dir, 'fixture.crt')
    const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8', timeout: 5000 })
    expect(generated.status).toBe(0)
    const upstream = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => { res.end(`${req.method} ${req.url}`) })
    const origin = (await listen(upstream)).replace('http:', 'https:')
    const file = join(dir, 'https.jsonl')
    const session = await start(file, origin, [], { NODE_EXTRA_CA_CERTS: cert })
    try {
      const res = await response(session.address, { method: 'POST', path: '/secure?x=1' }, 'body')
      expect((await bytes(res)).toString()).toBe('POST /secure?x=1')
      await stop(session)
      const events = await captures(file)
      expect(events.find((event) => event.kind === 'request')).toMatchObject({ method: 'POST', url: '/secure?x=1', body: { data: 'body' } })
      expect(events.find((event) => event.kind === 'response')?.requestId).toBe(events.find((event) => event.kind === 'request')?.requestId)
    } finally { session.child.kill('SIGKILL'); await close(upstream) }
  })

  it('rejects invalid proxy configuration before creating output', async () => {
    const invalid = [
      ['--mode', 'proxy'],
      ['--mode', 'invalid'],
      ['--mode', 'proxy', '--upstream', 'not-a-url'],
      ['--mode', 'proxy', '--upstream', 'ftp://127.0.0.1/'],
      ['--mode', 'capture', '--upstream', 'http://127.0.0.1:1234'],
    ]
    for (const [index, args] of invalid.entries()) {
      const file = join(dir, `invalid-proxy-${index}`, 'recording.jsonl')
      const result = spawnSync(process.execPath, [cli, 'record', '--output', file, 'http', ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })
})
