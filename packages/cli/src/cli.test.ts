import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

function startCli(args: string[], cwd: string) {
  const child = spawn(process.execPath, [cli, ...args], { cwd })
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

  async function stop(signal: NodeJS.Signals, requireRunning = false) {
    if (requireRunning && (child.exitCode !== null || child.signalCode !== null || exitStatus !== 'running' || !child.kill(signal))) {
      throw new Error(diagnostic('exited before shutdown'))
    }
    if (!requireRunning && exitStatus === 'running') child.kill(signal)
    const { promise, reject } = Promise.withResolvers<never>()
    const timer = setTimeout(() => reject(new Error(diagnostic('shutdown timeout'))), 5000)
    try {
      return await Promise.race([exited, promise])
    } finally {
      clearTimeout(timer)
    }
  }

  async function cleanup() {
    try {
      await stop('SIGTERM')
    } catch {
      child.kill('SIGKILL')
      await exited.catch(() => {})
    }
  }

  return { ready, stop, cleanup, diagnostic }
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
