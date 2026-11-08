import { spawnSync } from 'node:child_process'
import { appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseRecordingJsonl } from '@event-tape/recording-format'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cli, startCli, waitForRecorded } from '../../test-support/cli.js'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-cli-file-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('event-tape record file executable', () => {
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
        { path, json: { x: 1 }, partial: false },
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
})
