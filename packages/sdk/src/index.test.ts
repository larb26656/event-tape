import type { RecordingEnvelope } from '@event-tape/recording-format'
import { describe, expect, it } from 'vitest'
import { createRecorder } from './index.js'
import type { Writer } from './index.js'

class ArrayWriter implements Writer {
  readonly events: RecordingEnvelope[] = []
  closed = false
  write(event: RecordingEnvelope) { this.events.push(event) }
  close() { this.closed = true }
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
    let release!: () => void
    const promise = new Promise<void>((resolve) => { release = resolve })
    const writer: Writer = {
      async write(event) {
        if (event.seq === 1) await promise
        events.push(event.seq)
      },
      close() { events.push(99) },
    }
    const recorder = createRecorder({ writer })
    recorder.record({ source: 's', payload: 1 })
    recorder.record({ source: 's', payload: 2 })
    const closing = recorder.close()
    expect(events).toEqual([])
    release()
    await closing
    expect(events).toEqual([1, 2, 99])
    expect(recorder.close()).toBe(closing)
  })

  it('skips queued events after write failure, reports original error, and closes writer', async () => {
    const failure = new Error('write failed')
    const closeFailure = new Error('close failed')
    const writes: number[] = []
    let reportError: Error | undefined
    const writer: Writer = {
      write(event) { writes.push(event.seq); throw failure },
      close() { throw closeFailure },
    }
    const recorder = createRecorder({ writer, onError(error) { reportError = error; throw new Error('callback failed') } })
    recorder.record({ source: 's', payload: 1 })
    recorder.record({ source: 's', payload: 2 })
    await expect(recorder.close()).rejects.toBe(failure)
    expect(writes).toEqual([1])
    expect(reportError).toBe(failure)
    expect(() => recorder.record({ source: 's', payload: 3 })).toThrow(failure)
  })

  it('accounts buffered UTF-8 bytes and resumes acceptance when a write completes', async () => {
    const events: RecordingEnvelope[] = []
    let release!: () => void
    const promise = new Promise<void>((resolve) => { release = resolve })
    const writer: Writer = {
      async write(event) {
        if (event.seq === 1) await promise
        events.push(event)
      },
      close() {},
    }
    const firstLineBytes = (payload: string) => Buffer.byteLength(`${JSON.stringify({
      version: 1, seq: 1, timestamp: '2000-01-01T00:00:00.000Z', elapsedMs: 0, source: 's', payload,
    })}\n`)
    const maxBufferedBytes = firstLineBytes('é') + 50
    const recorder = createRecorder({ writer, maxBufferedBytes })
    recorder.record({ source: 's', payload: 'é' })
    expect(() => recorder.record({ source: 's', payload: 'é' })).toThrow(/buffer limit/)
    release()
    await promise
    await Promise.resolve()
    await Promise.resolve()
    recorder.record({ source: 's', payload: 'é' })
    await recorder.close()
    expect(events.map((event) => event.seq)).toEqual([1, 2])
  })
})
