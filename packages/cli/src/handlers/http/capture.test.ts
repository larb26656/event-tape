import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { request } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-record-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

interface Capture {
  requestId: string
  kind: string
  startedAt: string
  method: string
  url: string
  headers: Record<string, unknown>
  body: { encoding: 'utf8' | 'base64'; data: string; retainedBytes: number; truncated: boolean; incomplete: boolean }
}

interface Session {
  child: ChildProcessWithoutNullStreams
  address: string
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

async function start(file: string, args: string[] = [], shutdownTimeout?: string) {
  const sessionOptions = shutdownTimeout ? ['--shutdown-timeout', shutdownTimeout] : []
  const child = spawn(process.execPath, [cli, 'record', '--output', file, ...sessionOptions, 'http', ...args], { cwd: dir })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const { promise: exited, resolve: resolveExit, reject: rejectExit } = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  child.once('error', rejectExit)
  child.once('exit', (code, signal) => resolveExit({ code, signal }))
  const { promise: listening, resolve, reject } = Promise.withResolvers<string>()
  const timeout = setTimeout(() => reject(new Error(`CLI did not start: ${stdout} ${stderr}`)), 5000)
  const onData = () => {
    const match = stdout.match(/Listening: (http:\/\/127\.0\.0\.1:\d+)/)
    if (match && stdout.includes(`Recording: ${file}`)) {
      clearTimeout(timeout)
      resolve(match[1]!)
    }
  }
  child.stdout.on('data', onData)
  void exited.then(({ code }) => { clearTimeout(timeout); reject(new Error(`CLI exited ${code}: ${stdout} ${stderr}`)) }, reject)
  const address = await listening.catch((error: unknown) => { child.kill('SIGKILL'); throw error })
  return { child, address, exited }
}

async function stop(session: Session) {
  session.child.kill('SIGINT')
  const { promise, reject } = Promise.withResolvers<never>()
  const timeout = setTimeout(() => reject(new Error('CLI did not stop')), 5000)
  timeout.unref()
  const result = await Promise.race([session.exited, promise])
  clearTimeout(timeout)
  expect(result).toEqual({ code: 0, signal: null })
}

async function captures(file: string): Promise<Capture[]> {
  const text = await readFile(file, 'utf8')
  expect(text.endsWith('\n')).toBe(true)
  return text.trimEnd().split('\n').map((line, index) => {
    const event = JSON.parse(line) as { version: number; seq: number; timestamp: string; elapsedMs: number; payload: Capture }
    expect(event).toMatchObject({ version: 1, seq: index + 1 })
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false)
    expect(event.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(event.payload.requestId).toBeTruthy()
    expect(Number.isNaN(Date.parse(event.payload.startedAt))).toBe(false)
    return event.payload
  })
}

describe('record executable', () => {
  it('records real requests with redacted headers and byte-limited bodies', async () => {
    const file = join(dir, 'capture', 'requests.jsonl')
    const session = await start(file, ['--body-limit', '4', '--redact-header', 'X-Secret'])
    try {
      const inputs = [
        { path: '/short?token=visible', body: Buffer.from('abc') },
        { path: '/exact', body: Buffer.from('abcd') },
        { path: '/long', body: Buffer.from('abcdef') },
        { path: '/utf8', body: Buffer.from('ab€') },
        { path: '/binary', body: Buffer.from([0xff, 0x00, 0x80]) },
        { path: '/empty', body: Buffer.alloc(0) },
      ]
      for (const input of inputs) {
        const response = await fetch(`${session.address}${input.path}`, {
          method: 'POST', body: input.body,
          headers: { Authorization: 'bearer-secret', Cookie: 'cookie-secret', 'Set-Cookie': 'set-cookie-secret', 'X-Secret': 'custom-secret', 'X-Visible': 'public' },
        })
        expect(response.status).toBe(204)
      }
      await stop(session)
      const text = await readFile(file, 'utf8')
      for (const secret of ['bearer-secret', 'cookie-secret', 'set-cookie-secret', 'custom-secret']) expect(text).not.toContain(secret)
      const events = await captures(file)
      expect(events).toHaveLength(inputs.length)
      expect(new Set(events.map((event) => event.requestId)).size).toBe(inputs.length)
      for (const [index, event] of events.entries()) {
        expect(event).toMatchObject({ kind: 'request', method: 'POST', url: inputs[index]!.path })
        expect(event.headers['x-visible']).toBe('public')
      }
      expect(events.map((event) => event.body)).toEqual([
        { encoding: 'utf8', data: 'abc', retainedBytes: 3, truncated: false, incomplete: false },
        { encoding: 'utf8', data: 'abcd', retainedBytes: 4, truncated: false, incomplete: false },
        { encoding: 'utf8', data: 'abcd', retainedBytes: 4, truncated: true, incomplete: false },
        { encoding: 'base64', data: Buffer.from([0x61, 0x62, 0xe2, 0x82]).toString('base64'), retainedBytes: 4, truncated: true, incomplete: false },
        { encoding: 'base64', data: '/wCA', retainedBytes: 3, truncated: false, incomplete: false },
        { encoding: 'utf8', data: '', retainedBytes: 0, truncated: false, incomplete: false },
      ])
    } finally { session.child.kill('SIGKILL') }
  })

  it('records repeated header values separately and redacts each sensitive value case-insensitively', async () => {
    const file = join(dir, 'repeated-headers.jsonl')
    const session = await start(file, ['--redact-header', 'X-Secret'])
    try {
      const req = request(session.address, {
        headers: ['Host', new URL(session.address).host, 'X-Visible', 'first', 'x-visible', 'second', 'X-SECRET', 'one', 'x-secret', 'two'],
      })
      const received = once(req, 'response', { signal: AbortSignal.timeout(5000) })
      req.end()
      const [res] = await received
      res.resume()
      await once(res, 'end')
      expect(res.statusCode).toBe(204)
      await stop(session)
      const [event] = await captures(file)
      expect(event!.headers['x-visible']).toEqual(['first', 'second'])
      expect(event!.headers['x-secret']).toEqual(['[REDACTED]', '[REDACTED]'])
    } finally { session.child.kill('SIGKILL') }
  })

  it('allows explicitly disabling header redaction', async () => {
    const file = join(dir, 'unredacted.jsonl')
    const session = await start(file, ['--no-redact', '--redact-header', 'X-Secret'])
    try {
      expect((await fetch(`${session.address}/`, { headers: { Authorization: 'visible-token', 'X-Secret': 'visible-custom' } })).status).toBe(204)
      await stop(session)
      const [event] = await captures(file)
      expect(event!.headers).toMatchObject({ authorization: 'visible-token', 'x-secret': 'visible-custom' })
    } finally { session.child.kill('SIGKILL') }
  })

  it('finalizes a disconnected request as incomplete', async () => {
    const file = join(dir, 'aborted.jsonl')
    const session = await start(file)
    try {
      const url = new URL(session.address)
      const socket = connect(Number(url.port), url.hostname)
      await once(socket, 'connect')
      socket.write('POST /aborted HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10\r\nExpect: 100-continue\r\n\r\n')
      await once(socket, 'data')
      socket.end('abc')
      socket.resume()
      await once(socket, 'close')
      expect((await fetch(`${session.address}/after`)).status).toBe(204)
      await stop(session)
      const events = await captures(file)
      expect(events.find((event) => event.url === '/aborted')).toMatchObject({ body: { data: 'abc', retainedBytes: 3, truncated: false, incomplete: true } })
    } finally { session.child.kill('SIGKILL') }
  })

  it('ends idle uploads and records their incomplete prefix', async () => {
    const file = join(dir, 'idle.jsonl')
    const session = await start(file, ['--idle-timeout', '150'])
    try {
      const url = new URL(session.address)
      const socket = connect(Number(url.port), url.hostname)
      await once(socket, 'connect')
      socket.write('POST /idle HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10\r\n\r\nabc')
      socket.resume()
      // The child uses the platform clock, so this timeout must run in real time.
      await once(socket, 'close', { signal: AbortSignal.timeout(3000) })
      await stop(session)
      const events = await captures(file)
      expect(events.find((event) => event.url === '/idle')).toMatchObject({ body: { data: 'abc', retainedBytes: 3, incomplete: true } })
    } finally { session.child.kill('SIGKILL') }
  })

  it('keeps concurrent active uploads alive beyond the idle interval', async () => {
    const file = join(dir, 'active.jsonl')
    const session = await start(file, ['--idle-timeout', '300'])
    try {
      const requests = Array.from({ length: 8 }, (_, index) => {
        const req = request(session.address, { method: 'POST', path: `/active-${index}`, headers: { 'content-length': '6' } })
        const response = once(req, 'response')
        req.write('a')
        return { req, response }
      })
      // The child has its own real clock; activity must span its idle interval.
      for (let part = 0; part < 4; part++) {
        await delay(100)
        for (const { req } of requests) req.write('b')
      }
      for (const { req } of requests) req.end('c')
      for (const { response } of requests) {
        const [res] = await response
        expect(res.statusCode).toBe(204)
        res.resume()
      }
      await stop(session)
      const events = await captures(file)
      expect(events).toHaveLength(8)
      expect(events.every((event) => event.body.data === 'abbbbc' && !event.body.incomplete)).toBe(true)
    } finally { session.child.kill('SIGKILL') }
  })

  it('exits unsuccessfully when the shutdown deadline expires on a stalled upload', async () => {
    const file = join(dir, 'deadline.jsonl')
    const session = await start(file, ['--idle-timeout', '5000'], '100')
    try {
      const req = request(session.address, { method: 'POST', path: '/stalled', headers: { 'content-length': '10', expect: '100-continue' } })
      req.on('error', () => {})
      req.flushHeaders()
      await once(req, 'continue')
      req.write('abc')
      session.child.kill('SIGINT')
      expect(await session.exited).toEqual({ code: 1, signal: null })
      req.destroy()
    } finally { session.child.kill('SIGKILL') }
  })

  it('waits for an in-flight request on interrupt before closing the recording', async () => {
    const file = join(dir, 'graceful.jsonl')
    const session = await start(file, [], '3000')
    try {
      const url = new URL(session.address)
      const req = request(url, { method: 'POST', path: '/in-flight', headers: { 'content-length': '6', expect: '100-continue' } })
      const response = once(req, 'response')
      req.flushHeaders()
      await once(req, 'continue')
      req.write('abc')
      session.child.kill('SIGINT')
      req.end('def')
      const [res] = await response
      expect(res.statusCode).toBe(204)
      res.resume()
      expect(await session.exited).toEqual({ code: 0, signal: null })
      expect(await captures(file)).toMatchObject([{ url: '/in-flight', body: { data: 'abcdef', incomplete: false } }])
    } finally { session.child.kill('SIGKILL') }
  })

})
