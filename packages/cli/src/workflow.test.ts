import { appendFile, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { parseRecordingJsonl } from '@event-tape/recording-format'
import { describe, expect, it } from 'vitest'
import { startCli, type CliProcess } from './test-support/cli.js'

describe('event-tape recording workflows', () => {
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
})
