import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRecordingJsonl } from '@event-tape/recording-format'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecorder } from './index.js'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import type { Writer } from './index.js'

let directory = ''
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

class ArrayWriter implements Writer {
  readonly events: RecordingEnvelope[] = []
  closed = false
  write(event: RecordingEnvelope) { this.events.push(event) }
  close() { this.closed = true }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

describe('createRecorder with a custom Writer', () => {
  it('uses a supplied writer for structured, snapshotted v1 events', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    const payload = { nested: { value: 1 } }
    recorder.record({ source: 'test', direction: 'incoming', payload })
    payload.nested.value = 2
    await recorder.close()
    expect(writer.events).toHaveLength(1)
    expect(writer.events[0]).toMatchObject({ version: 1, seq: 1, source: 'test', direction: 'incoming', payload: { nested: { value: 1 } } })
    expect(writer.closed).toBe(true)
  })

  it('rejects ambiguous or missing destinations before opening a file', () => {
    const writer = new ArrayWriter()
    expect(() => createRecorder({ file: '/path-that-does-not-exist/recording.jsonl', writer } as never)).toThrow(/exactly one/)
    expect(() => createRecorder({} as never)).toThrow(/exactly one/)
    expect(writer.closed).toBe(false)
  })

  it('serializes asynchronous writes and drains accepted events on close', async () => {
    const events: number[] = []
    const { promise: gate, resolve: release } = deferred()
    const { promise: entered, resolve: signalEntered } = deferred()
    const writer: Writer = {
      async write(event) {
        if (event.seq === 1) {
          signalEntered()
          await gate
        }
        events.push(event.seq)
      },
      close() { events.push(99) },
    }
    const recorder = createRecorder({ writer })
    recorder.record({ source: 's', payload: 1 })
    recorder.record({ source: 's', payload: 2 })
    const closing = recorder.close()
    await entered
    expect(events).toEqual([])
    release()
    await closing
    expect(events).toEqual([1, 2, 99])
    expect(recorder.close()).toBe(closing)
  })

  it('rejects invalid and lossy payloads synchronously without consuming sequence numbers', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    expect(() => recorder.record({ source: 's', payload: undefined })).toThrow(/JSON-serializable/)
    expect(() => recorder.record({ source: 's', payload: { value: Number.NaN } })).toThrow(/JSON-serializable/)
    expect(() => recorder.record({ source: 's', payload: [1, undefined] })).toThrow(/JSON-serializable/)
    recorder.record({ source: 's', payload: 'accepted' })
    await recorder.close()
    expect(writer.events.map(({ seq }) => seq)).toEqual([1])
  })

  it('rejects records after close starts', async () => {
    const recorder = createRecorder({ writer: new ArrayWriter() })
    const closing = recorder.close()
    expect(() => recorder.record({ source: 's', payload: 1 })).toThrow(/closed/)
    await closing
  })

  it('preserves asynchronous Writer rejection and skips queued writes', async () => {
    const failure = new Error('async write failed')
    const writes: number[] = []
    const writer: Writer = {
      async write(event) {
        writes.push(event.seq)
        if (event.seq === 1) throw failure
      },
      close() {},
    }
    const recorder = createRecorder({ writer })
    recorder.record({ source: 's', payload: 1 })
    recorder.record({ source: 's', payload: 2 })
    await expect(recorder.close()).rejects.toBe(failure)
    expect(writes).toEqual([1])
    expect(() => recorder.record({ source: 's', payload: 3 })).toThrow(failure)
  })

  it('reports write failures and keeps them authoritative over callback and shutdown failures', async () => {
    const failure = new Error('write failed')
    const closeFailure = new Error('close failed')
    let reported: Error | undefined
    const writer: Writer = {
      write() { return Promise.reject(failure) },
      close() { throw closeFailure },
    }
    const recorder = createRecorder({ writer, onError(error) { reported = error; throw new Error('callback failed') } })
    recorder.record({ source: 's', payload: 1 })
    await expect(recorder.close()).rejects.toBe(failure)
    expect(reported).toBe(failure)
  })

  it('rejects shutdown when only Writer.close fails, including undefined rejections', async () => {
    const recorder = createRecorder({ writer: { write() {}, close() { throw new Error('close failed') } } })
    await expect(recorder.close()).rejects.toThrow('close failed')

    const undefinedThrow = createRecorder({ writer: { write() {}, close() { throw undefined } } })
    await expect(undefinedThrow.close()).rejects.toBeUndefined()

    const undefinedRejection = createRecorder({ writer: { write() {}, close() { return Promise.reject(undefined) } } })
    await expect(undefinedRejection.close()).rejects.toBeUndefined()
  })

  it('writes parseable, ordered, snapshotted events to a default file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-recorder-'))
    const file = join(directory, 'recording.jsonl')
    const recorder = createRecorder({ file })
    const payload = { nested: { value: 1 } }
    recorder.record({ source: 'listener', direction: 'incoming', payload })
    payload.nested.value = 2
    recorder.record({ source: 'listener', direction: 'outgoing', payload: { value: 'second' } })
    await recorder.close()

    const result = parseRecordingJsonl(await readFile(file, 'utf8'))
    expect(result.warning).toBeUndefined()
    expect(result.events).toHaveLength(2)
    expect(result.events.map(({ seq }) => seq)).toEqual([1, 2])
    expect(result.events.map(({ version }) => version)).toEqual([1, 1])
    expect(result.events.map(({ source }) => source)).toEqual(['listener', 'listener'])
    expect(result.events.every(({ timestamp, elapsedMs }) => Number.isFinite(Date.parse(timestamp)) && elapsedMs >= 0)).toBe(true)
    expect(result.events.map(({ direction }) => direction)).toEqual(['incoming', 'outgoing'])
    expect(result.events[0]?.payload).toEqual({ nested: { value: 1 } })
    expect(result.events[1]?.payload).toEqual({ value: 'second' })
  })

  it('accounts canonical JSONL UTF-8 bytes and resumes acceptance when a write completes', async () => {
    const events: RecordingEnvelope[] = []
    const { promise: gate, resolve: release } = deferred()
    const { promise: entered, resolve: signalEntered } = deferred()
    const { promise: secondStarted, resolve: signalSecondStarted } = deferred()
    const writer: Writer = {
      async write(event) {
        if (event.seq === 1) {
          signalEntered()
          await gate
        }
        events.push(event)
        if (event.seq === 2) signalSecondStarted()
      },
      close() {},
    }
    const canonicalLine = `${JSON.stringify({
      version: 1, seq: 1, timestamp: '2000-01-01T00:00:00.000Z', elapsedMs: 0, source: 's', payload: 'é',
    })}\n`
    const canonicalLineBytes = Buffer.byteLength(canonicalLine)
    const newlineLimitRecorder = createRecorder({ writer: new ArrayWriter(), maxBufferedBytes: canonicalLineBytes - 1 })
    expect(() => newlineLimitRecorder.record({ source: 's', payload: 'é' })).toThrow(/buffer limit/)
    await newlineLimitRecorder.close()

    const recorder = createRecorder({ writer, maxBufferedBytes: canonicalLineBytes * 2 + 100 })
    recorder.record({ source: 's', payload: 'é' })
    recorder.record({ source: 's', payload: 'é' })
    await entered
    expect(() => recorder.record({ source: 's', payload: 'é' })).toThrow(/buffer limit/)
    release()
    await secondStarted
    recorder.record({ source: 's', payload: 'é' })
    await recorder.close()
    expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3])
  })
})
