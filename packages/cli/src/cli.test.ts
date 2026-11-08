import { spawn, spawnSync } from 'node:child_process'
import { appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { parseRecordingJsonl } from '@event-tape/recording-format'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../dist/cli.mjs', import.meta.url))
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-cli-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

interface CliProcess {
  ready(pattern: RegExp): Promise<RegExpMatchArray>
  stop(signal: NodeJS.Signals, requireRunning?: boolean): Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  cleanup(): Promise<void>
  diagnostic(phase: string): string
}

function startCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  let exitStatus = 'running'
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const { promise: exited, resolve: resolveExit, reject: rejectExit } = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  child.once('error', (error) => { exitStatus = error.message; rejectExit(error) })
  child.once('close', (code, signal) => {
    exitStatus = `code=${code}, signal=${signal}`
    resolveExit({ code, signal })
  })
  // Observe spawn errors immediately, even if readiness fails before shutdown is awaited.
  void exited.catch(() => {})
  const diagnostic = (phase: string) =>
    `${args.join(' ')}: ${phase}; ${exitStatus}\nstdout: ${stdout}\nstderr: ${stderr}`

  async function ready(pattern: RegExp) {
    const { promise, resolve, reject } = Promise.withResolvers<RegExpMatchArray>()
    // Real deadlines bound external child processes; fake timers cannot control them.
    const timeout = setTimeout(() => finish(new Error(diagnostic('readiness timeout'))), 5000)
    const onData = () => {
      const match = stdout.match(pattern)
      if (match) finish(undefined, match)
    }
    const finish = (error?: Error, match?: RegExpMatchArray) => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      if (error) reject(error)
      else resolve(match!)
    }
    child.stdout.on('data', onData)
    void exited.then(
      () => finish(new Error(diagnostic('exited before readiness'))),
      () => finish(new Error(diagnostic('failed before readiness'))),
    )
    onData()
    return promise
  }

  async function waitForExit() {
    const { promise, reject } = Promise.withResolvers<never>()
    const timer = setTimeout(() => reject(new Error(diagnostic('shutdown timeout'))), 5000)
    try {
      return await Promise.race([exited, promise])
    } finally {
      clearTimeout(timer)
    }
  }

  async function stop(signal: NodeJS.Signals, requireRunning = false) {
    if (requireRunning && (child.exitCode !== null || child.signalCode !== null || exitStatus !== 'running' || !child.kill(signal))) {
      throw new Error(diagnostic('exited before shutdown'))
    }
    if (!requireRunning && exitStatus === 'running') child.kill(signal)
    return waitForExit()
  }

  async function cleanup() {
    try {
      await stop('SIGTERM')
    } catch {
      child.kill('SIGKILL')
      await exited.catch(() => {})
    }
  }

  return { ready, stop, waitForExit, cleanup, diagnostic, signal: (signal: NodeJS.Signals) => child.kill(signal) }
}

async function waitForRecorded(file: string, text: string, process: CliProcess) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if ((await readFile(file, 'utf8')).includes(text)) return
    // The built CLI is a separate process using real filesystem polling.
    await delay(20)
  }
  throw new Error(process.diagnostic(`waiting for recorded ${text}`))
}

describe('event-tape executable', () => {
  it('handles informational and invalid invocations without starting a server', () => {
    for (const args of [['--help'], ['--version'], ['view'], ['--invalid']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.stdout).not.toContain('Event Tape Player:')
      expect(result.status).toBe(args[0] === '--help' || args[0] === '--version' ? 0 : 1)
    }
  })

  it('scopes session and HTTP options in command help', () => {
    const record = spawnSync(process.execPath, [cli, 'record', '--help'], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    const http = spawnSync(process.execPath, [cli, 'record', 'http', '--help'], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    expect(record.error).toBeUndefined()
    expect(http.error).toBeUndefined()
    expect(record.status).toBe(0)
    expect(http.status).toBe(0)
    expect(record.stdout).toContain('--output')
    expect(record.stdout).toContain('--shutdown-timeout')
    expect(record.stdout).toContain('http')
    expect(record.stdout).not.toContain('--preset')
    expect(record.stdout).not.toContain('--port')
    expect(http.stdout).toContain('--preset')
    expect(http.stdout).toContain('--preset-file')
    expect(http.stdout).toContain('--port')
    expect(http.stdout).not.toContain('--output')
    expect(http.stdout).not.toContain('--shutdown-timeout')
  })

  it('rejects the removed handler selector and unscoped HTTP options', () => {
    for (const args of [['record', '--handler', 'http'], ['record', '--preset', 'otel'], ['record', '--port', '0']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
    }
  })

  it('records HTTP requests and serves the resulting Recording through view', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'event-tape-workflow-'))
    const record = startCli(['record', 'http'], workdir)
    let view: CliProcess | undefined
    try {
      const announcement = await record.ready(/Listening: (http:\/\/127\.0\.0\.1:\d+)\r?\nRecording: ([^\r\n]+)\r?\n/)
      const address = announcement[1]!
      const file = announcement[2]!
      expect(await realpath(dirname(file))).toBe(await realpath(join(workdir, '.tape')))
      expect(file).toMatch(/\.jsonl$/)

      const inputs = [
        { path: '/events/first?source=test', body: '{"id":1,"message":"สวัสดี"}' },
        { path: '/events/second', body: '{"id":2,"message":"ขอบคุณ"}' },
      ]
      for (const input of inputs) {
        const response = await fetch(`${address}${input.path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: input.body,
          signal: AbortSignal.timeout(5000),
        })
        expect(response.status).toBe(204)
      }
      expect(await record.stop('SIGINT', true), record.diagnostic('record shutdown')).toEqual({ code: 0, signal: null })

      const bytes = await readFile(file)
      const text = bytes.toString('utf8')
      expect(text.endsWith('\n')).toBe(true)
      const recording = parseRecordingJsonl(text)
      expect(recording.warning).toBeUndefined()
      expect(recording.events).toHaveLength(2)
      expect(recording.events.map(({ seq, source, direction, payload }) => ({ seq, source, direction, payload }))).toEqual(
        inputs.map((input, index) => ({
          seq: index + 1,
          source: 'http',
          direction: 'request',
          payload: expect.objectContaining({
            kind: 'request',
            method: 'POST',
            url: input.path,
            body: {
              encoding: 'utf8',
              data: input.body,
              retainedBytes: Buffer.byteLength(input.body),
              truncated: false,
              incomplete: false,
            },
          }),
        })),
      )

      view = startCli(['view', file, '--no-browser'], workdir)
      const playerUrl = (await view.ready(/Event Tape Player: (http:\/\/127\.0\.0\.1:\d+)\r?\n/))[1]!
      const get = (path: string) => fetch(new URL(path, playerUrl), { signal: AbortSignal.timeout(5000) })
      const page = await get('/')
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('<!doctype html>')
      const script = html.match(/src="([^"]+\.js)"/)
      expect(script).not.toBeNull()
      expect((await get(script![1]!)).status).toBe(200)
      const metadata = await get('/recording-metadata.json')
      expect(metadata.status).toBe(200)
      expect(await metadata.json()).toEqual({ name: basename(file) })
      const response = await get('/recording.jsonl')
      expect(response.status).toBe(200)
      const served = Buffer.from(await response.arrayBuffer())
      expect(served).toEqual(bytes)
      const parsed = parseRecordingJsonl(served.toString('utf8'))
      expect(parsed.warning).toBeUndefined()
      expect(parsed.events).toEqual(recording.events)
      await view.stop('SIGTERM', true)
    } catch (error) {
      throw new Error(`Workflow failed\n${record.diagnostic('record')}\n${view?.diagnostic('view') ?? 'view not started'}`, { cause: error })
    } finally {
      await view?.cleanup()
      await record.cleanup()
      await rm(workdir, { recursive: true, force: true })
    }
  }, 30000)

  it('records a file and serves the Recording through view', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'event-tape-file-workflow-'))
    const source = join(await realpath(workdir), 'app.log')
    await writeFile(source, 'old line\n')
    const record = startCli(['record', 'file', '--path', 'app.log'], workdir)
    let view: CliProcess | undefined
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await appendFile(source, 'first\nunfinished')
      expect(await record.stop('SIGINT', true), record.diagnostic('record shutdown')).toEqual({ code: 0, signal: null })
      const bytes = await readFile(file)
      const recording = parseRecordingJsonl(bytes.toString('utf8'))
      expect(recording.warning).toBeUndefined()
      expect(recording.events.map(({ source, payload }) => ({ source, payload }))).toEqual([
        { source: 'file', payload: { path: source, text: 'first', partial: false } },
        { source: 'file', payload: { path: source, text: 'unfinished', partial: true } },
      ])
      view = startCli(['view', file, '--no-browser'], workdir)
      const url = (await view.ready(/Event Tape Player: (http:\/\/127\.0\.0\.1:\d+)\r?\n/))[1]!
      const response = await fetch(new URL('/recording.jsonl', url), { signal: AbortSignal.timeout(5000) })
      expect(response.status).toBe(200)
      const served = Buffer.from(await response.arrayBuffer())
      expect(served).toEqual(bytes)
      expect(parseRecordingJsonl(served.toString('utf8')).events).toEqual(recording.events)
      await view.stop('SIGTERM', true)
    } finally {
      await view?.cleanup()
      await record.cleanup()
      await rm(workdir, { recursive: true, force: true })
    }
  }, 30000)

  it('waits for a missing file and reads it from the beginning', async () => {
    const path = join(dir, 'created-after-ready.log')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await writeFile(path, 'created\n')
      await waitForRecorded(file, 'created', record)
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)).toEqual([
        { path, text: 'created', partial: false },
      ])
    } finally { await record.cleanup() }
  })

  it('follows replacement, removal and observable truncation without joining generations', async () => {
    const workdir = await mkdtemp(join(tmpdir(), 'event-tape-file-lifecycle-'))
    const path = join(await realpath(workdir), 'app.log')
    await writeFile(path, '')
    const record = startCli(['record', 'file', '--path', path], workdir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await appendFile(path, 'first\nold fragment')
      await waitForRecorded(file, 'first', record)
      await rename(path, `${path}.old`)
      await writeFile(path, 'replacement\nreplace fragment')
      await waitForRecorded(file, 'replacement', record)
      await rm(path)
      await waitForRecorded(file, 'replace fragment', record)
      await writeFile(path, 'recreated\nrecreate fragment')
      await waitForRecorded(file, 'recreated', record)
      await truncate(path, 0)
      await waitForRecorded(file, 'recreate fragment', record)
      await appendFile(path, 'truncated\nlast fragment')
      await waitForRecorded(file, 'truncated', record)
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)).toEqual([
        { path, text: 'first', partial: false },
        { path, text: 'old fragment', partial: true },
        { path, text: 'replacement', partial: false },
        { path, text: 'replace fragment', partial: true },
        { path, text: 'recreated', partial: false },
        { path, text: 'recreate fragment', partial: true },
        { path, text: 'truncated', partial: false },
        { path, text: 'last fragment', partial: true },
      ])
    } finally {
      await record.cleanup()
      await rm(workdir, { recursive: true, force: true })
    }
  }, 30000)

  it('stops promptly while waiting for a missing file', async () => {
    const path = join(dir, 'never-created.log')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events).toEqual([])
    } finally { await record.cleanup() }
  })

  it('drains the attached generation when shutdown races replacement', async () => {
    const path = join(dir, 'shutdown-replacement.log')
    await writeFile(path, '')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await appendFile(path, 'before\nold tail')
      await waitForRecorded(file, 'before', record)
      await rename(path, `${path}.old`)
      await writeFile(path, 'new line\n')
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      const payloads = parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)
      expect(payloads.slice(0, 2)).toEqual([
        { path, text: 'before', partial: false },
        { path, text: 'old tail', partial: true },
      ])
      expect([2, 3]).toContain(payloads.length)
      if (payloads.length === 3) expect(payloads[2]).toEqual({ path, text: 'new line', partial: false })
    } finally { await record.cleanup() }
  })

  it('fails when a waiting path becomes a directory', async () => {
    const path = join(dir, 'appearing-directory')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      await record.ready(/Recording: ([^\r\n]+)\r?\n/)
      await mkdir(path)
      expect((await record.waitForExit()).code, record.diagnostic('directory failure')).not.toBe(0)
      expect(record.diagnostic('directory failure')).toContain('not a regular file')
    } finally { await record.cleanup() }
  })

  it('fails on incomplete UTF-8 at a replacement boundary', async () => {
    const path = join(dir, 'incomplete-generation.log')
    await writeFile(path, '')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await appendFile(path, Buffer.concat([Buffer.from('marker\n'), Buffer.from([0xe2, 0x82])]))
      await waitForRecorded(file, 'marker', record)
      await rename(path, `${path}.old`)
      await writeFile(path, Buffer.from([0xac, 10]))
      expect((await record.waitForExit()).code, record.diagnostic('failure')).not.toBe(0)
    } finally { await record.cleanup() }
  })

  it('records independent lines and split UTF-8 from multiple files', async () => {
    const first = join(dir, 'multi-first.log')
    const second = join(dir, 'multi-second.log')
    await writeFile(first, 'old partial')
    await writeFile(second, 'old\n')
    const record = startCli(['record', 'file', '--path', first, '--path', second], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      const character = Buffer.from('界')
      await appendFile(first, ' ignored\nfirst\npart')
      await appendFile(second, Buffer.concat([Buffer.from('second '), character.subarray(0, 1)]))
      await appendFile(first, 'ial')
      await appendFile(second, Buffer.concat([character.subarray(1), Buffer.from('\nlast')]))
      expect(await record.stop('SIGINT', true), record.diagnostic('multi-file shutdown')).toEqual({ code: 0, signal: null })
      const events = parseRecordingJsonl(await readFile(file, 'utf8')).events
      expect(events.filter(({ payload }) => payload && typeof payload === 'object' && 'path' in payload && payload.path === first).map(({ payload }) => payload)).toEqual([
        { path: first, text: 'first', partial: false },
        { path: first, text: 'partial', partial: true },
      ])
      expect(events.filter(({ payload }) => payload && typeof payload === 'object' && 'path' in payload && payload.path === second).map(({ payload }) => payload)).toEqual([
        { path: second, text: 'second 界', partial: false },
        { path: second, text: 'last', partial: true },
      ])
      expect(events).toHaveLength(4)
    } finally { await record.cleanup() }
  })

  it('continues another file while following a missing and replaced file', async () => {
    const first = join(dir, 'multi-lifecycle-first.log')
    const second = join(dir, 'multi-lifecycle-second.log')
    await writeFile(second, '')
    const record = startCli(['record', 'file', '--path', first, '--path', second], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await writeFile(first, 'first created\nfirst tail')
      await appendFile(second, 'second before\nsecond tail')
      await waitForRecorded(file, 'first created', record)
      await waitForRecorded(file, 'second before', record)
      await rename(first, `${first}.old`)
      await writeFile(first, 'first replaced\n')
      await appendFile(second, ' continued\nsecond after\n')
      await waitForRecorded(file, 'first replaced', record)
      await waitForRecorded(file, 'second after', record)
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      const payloads = parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)
      expect(payloads.filter((payload) => payload && typeof payload === 'object' && 'path' in payload && payload.path === first)).toEqual([
        { path: first, text: 'first created', partial: false },
        { path: first, text: 'first tail', partial: true },
        { path: first, text: 'first replaced', partial: false },
      ])
      expect(payloads.filter((payload) => payload && typeof payload === 'object' && 'path' in payload && payload.path === second)).toEqual([
        { path: second, text: 'second before', partial: false },
        { path: second, text: 'second tail continued', partial: false },
        { path: second, text: 'second after', partial: false },
      ])
      expect(payloads).toHaveLength(6)
    } finally { await record.cleanup() }
  })

  it('reads existing content, preserves framing, and validates UTF-8', async () => {
    const path = join(dir, 'framing.log')
    await writeFile(path, '  {"x":1}  \r\n\nสวัสดี\n')
    const record = startCli(['record', 'file', '--path', path, '--from-start'], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      const thai = Buffer.from('界')
      await appendFile(path, thai.subarray(0, 1))
      await appendFile(path, Buffer.concat([thai.subarray(1), Buffer.from('\n')]))
      expect(await record.stop('SIGTERM', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)).toEqual([
        { path, text: '  {"x":1}  ', partial: false },
        { path, text: '', partial: false },
        { path, text: 'สวัสดี', partial: false },
        { path, text: '界', partial: false },
      ])
    } finally { await record.cleanup() }
  })

  it('skips the continuation of a pre-existing incomplete line', async () => {
    const path = join(dir, 'partial.log')
    await writeFile(path, 'old')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      await appendFile(path, ' suffix\nnew\n')
      expect(await record.stop('SIGINT', true), record.diagnostic('shutdown')).toEqual({ code: 0, signal: null })
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)).toEqual([
        { path, text: 'new', partial: false },
      ])
    } finally { await record.cleanup() }
  })

  for (const invalid of [Buffer.from([0xff, 10]), Buffer.from([0xe2, 0x82])]) {
    it(`fails for invalid or incomplete UTF-8 ${invalid.toString('hex')}`, async () => {
      const path = join(dir, `invalid-${invalid.toString('hex')}.log`)
      await writeFile(path, '')
      const record = startCli(['record', 'file', '--path', path], dir)
      try {
        await record.ready(/Recording: ([^\r\n]+)\r?\n/)
        await appendFile(path, invalid)
        expect((await record.stop('SIGINT')).code, record.diagnostic('invalid UTF-8')).toBe(1)
        expect(record.diagnostic('invalid UTF-8')).toMatch(/encoded data|encoding/i)
      } finally { await record.cleanup() }
    })
  }

  it('fails immediately on invalid UTF-8 without a terminating newline', async () => {
    const path = join(dir, 'invalid-open.log')
    await writeFile(path, '')
    const record = startCli(['record', 'file', '--path', path], dir)
    try {
      await record.ready(/Recording: ([^\r\n]+)\r?\n/)
      await appendFile(path, Buffer.from([0xff]))
      expect((await record.waitForExit()).code, record.diagnostic('invalid UTF-8')).toBe(1)
      expect(record.diagnostic('invalid UTF-8')).toMatch(/encoded data|encoding/i)
    } finally { await record.cleanup() }
  }, 10000)

  it('accepts exactly one MiB and rejects a larger unterminated line', async () => {
    for (const size of [1_048_576, 1_048_577]) {
      const path = join(dir, `size-${size}.log`)
      await writeFile(path, 'x'.repeat(size))
      const record = startCli(['record', 'file', '--path', path, '--from-start'], dir)
      try {
        const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
        const status = await record.stop('SIGINT')
        expect(status.code, record.diagnostic('size boundary')).toBe(size === 1_048_576 ? 0 : 1)
        const events = parseRecordingJsonl(await readFile(file, 'utf8')).events
        if (size === 1_048_576) expect(events.map(({ payload }) => payload)).toEqual([{ path, text: 'x'.repeat(size), partial: true }])
        else {
          expect(events).toEqual([])
          expect(record.diagnostic('size boundary')).toContain('1048576')
        }
      } finally { await record.cleanup() }
    }
  })

  it('applies file presets and replaces their path with a CLI override', async () => {
    const first = join(dir, 'preset-first.log')
    const second = join(dir, 'preset-second.log')
    const preset = join(dir, 'file-preset.yaml')
    await writeFile(first, 'first\n')
    await writeFile(second, 'second\n')
    await writeFile(preset, `input: file\noptions:\n  paths:\n    - ${first}\n  fromStart: true\n`)
    const record = startCli(['record', 'file', '--preset-file', preset, '--path', second], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      expect((await record.stop('SIGINT', true)).code, record.diagnostic('preset')).toBe(0)
      expect(parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)).toEqual([
        { path: second, text: 'second', partial: false },
      ])
    } finally { await record.cleanup() }
  })

  it('replaces the entire preset path list and applies from-start to every CLI path', async () => {
    const preset = join(dir, 'multi-preset.yaml')
    const paths = ['preset-a', 'preset-b', 'override-a', 'override-b'].map((name) => join(dir, `${name}.log`))
    for (const path of paths) await writeFile(path, `${basename(path)}\n`)
    await writeFile(preset, `input: file\noptions:\n  paths:\n    - ${paths[0]}\n    - ${paths[1]}\n  fromStart: false\n`)
    const record = startCli(['record', 'file', '--preset-file', preset, '--path', paths[2]!, '--path', paths[3]!, '--from-start'], dir)
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      expect((await record.stop('SIGINT', true)).code, record.diagnostic('multi preset')).toBe(0)
      const payloads = parseRecordingJsonl(await readFile(file, 'utf8')).events.map(({ payload }) => payload)
      expect(payloads).toHaveLength(2)
      expect(payloads).toContainEqual({ path: paths[2], text: 'override-a.log', partial: false })
      expect(payloads).toContainEqual({ path: paths[3], text: 'override-b.log', partial: false })
    } finally { await record.cleanup() }
  })

  it('terminates the whole multi-file session when one file has invalid UTF-8', async () => {
    const first = join(dir, 'fatal-first.log')
    const second = join(dir, 'fatal-second.log')
    await writeFile(first, '')
    await writeFile(second, '')
    const record = startCli(['record', 'file', '--path', first, '--path', second], dir)
    try {
      await record.ready(/Recording: ([^\r\n]+)\r?\n/)
      await appendFile(first, 'valid\n')
      await appendFile(second, Buffer.from([0xff]))
      expect((await record.waitForExit()).code, record.diagnostic('multi-file failure')).toBe(1)
      expect(record.diagnostic('multi-file failure')).toContain(second)
      expect(record.diagnostic('multi-file failure')).toMatch(/encoded data|encoding/i)
    } finally { await record.cleanup() }
  }, 10000)

  it('stops while both files continue receiving writes', async () => {
    const paths = [join(dir, 'busy-a.log'), join(dir, 'busy-b.log')]
    for (const path of paths) await writeFile(path, '')
    const record = startCli(['record', 'file', '--path', paths[0]!, '--path', paths[1]!], dir)
    let writing = true
    let writer: Promise<void> | undefined
    try {
      const file = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      for (const path of paths) await appendFile(path, 'before\npartial')
      writer = (async () => {
        while (writing) for (const path of paths) await appendFile(path, 'x')
      })()
      expect((await record.stop('SIGINT', true)).code, record.diagnostic('busy shutdown')).toBe(0)
      const events = parseRecordingJsonl(await readFile(file, 'utf8')).events
      for (const path of paths) {
        const payloads = events.filter(({ payload }) => payload && typeof payload === 'object' && 'path' in payload && payload.path === path).map(({ payload }) => payload)
        expect(payloads[0]).toEqual({ path, text: 'before', partial: false })
        expect(payloads[1]).toMatchObject({ path, partial: true })
        expect(payloads).toHaveLength(2)
      }
    } finally {
      writing = false
      await writer
      await record.cleanup()
    }
  }, 10000)

  it.skipIf(process.platform === 'win32')('forces file shutdown when the shared deadline expires', async () => {
    const path = join(dir, 'deadline-source.log')
    const marker = join(dir, 'pool-saturated')
    const preload = join(dir, 'saturate-pool.cjs')
    await writeFile(path, '')
    // Saturate the child process's real filesystem worker pool only after readiness.
    await writeFile(preload, `
      const { pbkdf2 } = require('node:crypto')
      const { writeFileSync } = require('node:fs')
      process.once('SIGUSR2', () => {
        for (let i = 0; i < 4; i++) pbkdf2('x', 'y', 2000000, 32, 'sha256', () => {})
        writeFileSync(${JSON.stringify(marker)}, 'ready')
      })
    `)
    const record = startCli(
      ['record', '--shutdown-timeout', '100', 'file', '--path', path],
      dir,
      { NODE_OPTIONS: `--require=${preload}`, UV_THREADPOOL_SIZE: '4' },
    )
    try {
      const output = (await record.ready(/Recording: ([^\r\n]+)\r?\n/))[1]!
      expect(record.signal('SIGUSR2')).toBe(true)
      const deadline = Date.now() + 5000
      while (true) {
        try { await readFile(marker); break } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || Date.now() >= deadline) throw error
          await delay(10)
        }
      }
      await appendFile(path, 'pending\n')
      expect(await record.stop('SIGINT', true), record.diagnostic('deadline')).toEqual({ code: 1, signal: null })
      expect(record.diagnostic('deadline')).toContain('Shutdown deadline exceeded')
      await rename(path, `${path}.released`)
      await rename(output, `${output}.released`)
    } finally { await record.cleanup() }
  }, 15000)

  it('rejects invalid file options and directories', async () => {
    const preset = join(dir, 'invalid-file-preset.yaml')
    await writeFile(preset, 'input: file\noptions:\n  paths: [example]\n  extra: true\n')
    for (const args of [
      ['record', 'file', '--preset-file', preset],
      ['record', 'file', '--path', dir],
    ]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/extra|regular file/)
    }
  })

  it.skipIf(process.platform === 'win32')('reports an unreadable file path even when tests run as root', async () => {
    const root = process.getuid?.() === 0
    const fixture = await mkdtemp(join(root ? '/tmp' : tmpdir(), 'event-tape-permission-'))
    const path = join(fixture, 'unreadable.log')
    try {
      await chmod(fixture, 0o777)
      await writeFile(path, 'secret')
      await chmod(path, 0)
      const result = spawnSync(process.execPath, [cli, 'record', '--output', join(fixture, 'recording.jsonl'), 'file', '--path', path], {
        cwd: fixture, encoding: 'utf8', timeout: 5000, ...(root ? { uid: 65534, gid: 65534 } : {}),
      })
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(path)
      expect(result.stderr).toMatch(/EACCES|permission denied/i)
    } finally { await rm(fixture, { recursive: true, force: true }) }
  })

  it.skipIf(process.platform === 'win32')('rejects a named pipe at startup and when it appears during polling', async () => {
    const initial = join(dir, 'initial.fifo')
    const mkfifo = spawnSync('mkfifo', [initial], { encoding: 'utf8' })
    expect(mkfifo.status, mkfifo.stderr).toBe(0)
    const startup = startCli(['record', 'file', '--path', initial], dir)
    try {
      expect((await startup.waitForExit()).code, startup.diagnostic('FIFO startup')).toBe(1)
      expect(startup.diagnostic('FIFO startup')).toContain('not a regular file')
    } finally { await startup.cleanup() }

    const later = join(dir, 'later.fifo')
    const polling = startCli(['record', 'file', '--path', later], dir)
    try {
      await polling.ready(/Recording: ([^\r\n]+)\r?\n/)
      const created = spawnSync('mkfifo', [later], { encoding: 'utf8' })
      expect(created.status, created.stderr).toBe(0)
      expect((await polling.waitForExit()).code, polling.diagnostic('FIFO polling')).toBe(1)
      expect(polling.diagnostic('FIFO polling')).toContain('not a regular file')
    } finally { await polling.cleanup() }
  }, 15000)

  for (const prefix of [[], ['view']]) {
    it(`serves the packaged Player and recording using ${prefix.length ? 'view' : 'filename shorthand'}`, async () => {
      const recording = join(dir, 'recording.jsonl')
      await writeFile(recording, '')
      const child = spawn(process.execPath, [cli, ...prefix, recording, '--no-browser'], { cwd: dir })
      try {
        const { promise, resolve, reject } = Promise.withResolvers<string>()
        child.once('error', reject)
        child.once('exit', (code) => reject(new Error(`CLI exited: ${code}`)))
        child.stdout.once('data', (data: Buffer) => {
          const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/)
          if (match) resolve(match[0]); else reject(new Error(data.toString()))
        })
        const url = await promise
        const html = await (await fetch(url)).text()
        expect(html).toContain('<!doctype html>')
        expect((await fetch(`${url}/recording-metadata.json`)).status).toBe(200)
        expect(await (await fetch(`${url}/recording.jsonl`)).text()).toBe('')
        const script = html.match(/src="([^"]+\.js)"/)
        expect(script).not.toBeNull()
        expect((await fetch(new URL(script![1], url))).status).toBe(200)
      } finally { child.kill() }
    })
  }
})
