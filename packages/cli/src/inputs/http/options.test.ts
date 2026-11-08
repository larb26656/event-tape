import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { httpInput } from './index.js'

const cli = fileURLToPath(new URL('../../../dist/cli.mjs', import.meta.url))
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-options-')) })
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

async function start(file: string, args: string[] = []) {
  const child = spawn(process.execPath, [cli, 'record', '--output', file, 'http', ...args], { cwd: dir })
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

describe('HTTP options and presets', () => {
  it('resolves preset values and explicit overrides through the input interface', () => {
    expect(httpInput.resolve(
      { bodyLimit: 2, redact: true, redactHeaders: ['x-old'] },
      { bodyLimit: '3', redact: false, redactHeader: ['X-New'] },
    )).toMatchObject({ bodyLimit: 3, redact: false, redactHeaders: ['x-new'], mode: 'capture' })
    expect(() => httpInput.resolve({ mode: 'proxy' }, {})).toThrow(/upstream/)
  })

  it('applies YAML options and explicit boolean and numeric overrides to real capture', async () => {
    const preset = join(dir, 'capture.yaml')
    const file = join(dir, 'preset-capture.jsonl')
    await writeFile(preset, 'input: http\noptions:\n  bodyLimit: 2\n  redact: true\n  redactHeaders: [x-secret]\n')
    const session = await start(file, ['--preset-file', preset, '--body-limit', '3', '--no-redact'])
    try {
      expect((await fetch(session.address, { method: 'POST', body: 'abcdef', headers: { authorization: 'visible' } })).status).toBe(204)
      await stop(session)
      const [event] = await captures(file)
      expect(event!.headers.authorization).toBe('visible')
      expect(event!.body).toMatchObject({ data: 'abc', retainedBytes: 3, truncated: true })
    } finally { session.child.kill('SIGKILL') }
  })

  it('rejects invalid presets before creating an output', async () => {
    const preset = join(dir, 'invalid.yaml')
    const file = join(dir, 'invalid-output.jsonl')
    for (const yaml of ['input: http\noptions:\n  mode: proxy\n', 'input: http\noutput: forbidden\n', 'input: http\noptions:\n  bodyLimit: false\n', 'input: [\n', 'handler: http\noptions: {}\n']) {
      await writeFile(preset, yaml)
      const result = spawnSync(process.execPath, [cli, 'record', '--output', file, 'http', '--preset-file', preset], { cwd: dir, encoding: 'utf8' })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/upstream|output|bodyLimit|preset-file/)
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('rejects a preset for a different input before creating output', async () => {
    const preset = join(dir, 'wrong-input.yaml')
    const file = join(dir, 'wrong-input.jsonl')
    await writeFile(preset, 'input: other\noptions: {}\n')
    const result = spawnSync(process.execPath, [cli, 'record', '--output', file, 'http', '--preset-file', preset], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/input/i)
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects invalid HTTP fields and numeric forms before opening output or a listener', async () => {
    const occupied = createServer()
    occupied.listen(0, '127.0.0.1')
    await once(occupied, 'listening')
    const address = occupied.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP address')
    try {
      const cases = [
        ['unknownThing: true', 'unknownThing'],
        ['port: 65536', 'port'],
        ['port: -1', 'port'],
        ['bodyLimit: 8388609', 'bodyLimit'],
        ['bodyLimit: 1.5', 'bodyLimit'],
        ['bodyLimit: "1e3"', 'bodyLimit'],
        ['bodyLimit: " 1"', 'bodyLimit'],
        ['idleTimeout: 0', 'idleTimeout'],
        ['idleTimeout: 2147483648', 'idleTimeout'],
        ['redact: "false"', 'redact'],
        ['redactHeaders: ["bad header"]', 'redactHeaders'],
        ['mode: capture\n  upstream: http://localhost:1234', 'upstream'],
        ['mode: proxy\n  upstream: http://localhost:1234/path', 'upstream'],
      ]
      for (const [index, [option, field]] of cases.entries()) {
        const preset = join(dir, `bad-option-${index}.yaml`)
        const file = join(dir, `bad-option-${index}`, 'recording.jsonl')
        await writeFile(preset, `input: http\noptions:\n  ${option}\n`)
        const args = ['record', '--output', file, 'http', '--preset-file', preset]
        if (!option!.startsWith('port:')) args.push('--port', String(address.port))
        const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
        expect(result.error).toBeUndefined()
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain(field)
        expect(result.stderr).not.toMatch(/EADDRINUSE/)
        await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
      }
    } finally {
      occupied.close()
      await once(occupied, 'close')
    }
  })

  it('accepts numeric boundaries and captures zero bytes when configured', async () => {
    const file = join(dir, 'boundaries.jsonl')
    const session = await start(file, ['--port', '0', '--body-limit', '0', '--idle-timeout', '2147483647'])
    try {
      expect((await fetch(session.address, { method: 'POST', body: 'a' })).status).toBe(204)
      await stop(session)
      expect((await captures(file))[0]!.body).toMatchObject({ data: '', retainedBytes: 0, truncated: true })
    } finally { session.child.kill('SIGKILL') }
    const max = await start(join(dir, 'maximum.jsonl'), ['--body-limit', '8388608', '--idle-timeout', '1'])
    try { await stop(max) } finally { max.child.kill('SIGKILL') }
  })

  it('rejects invalid options before creating output and never overwrites an existing file', async () => {
    const invalid = [
      ['unknown'],
      ['http', '--port', 'not-a-port'],
      ['http', '--body-limit', '-1'],
      ['http', '--idle-timeout', 'nope'],
      ['--shutdown-timeout', 'nope', 'http'],
      ['http', '--unknown-option', 'value'],
    ]
    for (const [index, args] of invalid.entries()) {
      const file = join(dir, `invalid-${index}`, 'recording.jsonl')
      const result = spawnSync(process.execPath, [cli, 'record', '--output', file, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    const existing = join(dir, 'existing.jsonl')
    await writeFile(existing, 'do not overwrite\n')
    const result = spawnSync(process.execPath, [cli, 'record', '--output', existing, 'http', '--port', '0'], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    expect(result.error).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(await readFile(existing, 'utf8')).toBe('do not overwrite\n')
  })
})
