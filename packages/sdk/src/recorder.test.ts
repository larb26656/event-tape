import { performance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { createRecorder } from './index.js'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import type { Recorder, Writer } from './index.js'

class ArrayWriter implements Writer {
  readonly events: RecordingEnvelope[] = []
  closed = false
  write(event: RecordingEnvelope) {
    this.events.push(event)
  }
  close() {
    this.closed = true
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Recorder behavior', () => {
  it('uses a supplied writer for structured, snapshotted v1 events', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    const payload = { nested: { value: 1 } }
    recorder.record({ source: 'test', direction: 'incoming', payload })
    payload.nested.value = 2
    await recorder.close()
    expect(writer.events).toHaveLength(1)
    expect(writer.events[0]).toMatchObject({
      version: 1,
      seq: 1,
      source: 'test',
      direction: 'incoming',
      payload: { nested: { value: 1 } },
    })
  })

  it('rejects ambiguous or missing destinations before opening a file', () => {
    const writer = new ArrayWriter()
    expect(() =>
      createRecorder({
        file: '/path-that-does-not-exist/recording.jsonl',
        writer,
      } as never),
    ).toThrow()
    expect(() => createRecorder({} as never)).toThrow()
    expect(writer.closed).toBe(false)
  })

  it('rejects invalid and lossy payloads synchronously without consuming sequence numbers', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    expect(() => recorder.record({ source: 's', payload: undefined })).toThrow()
    expect(() =>
      recorder.record({ source: 's', payload: { value: Number.NaN } }),
    ).toThrow()
    expect(() =>
      recorder.record({ source: 's', payload: [1, undefined] }),
    ).toThrow()
    recorder.record({ source: 's', payload: 'accepted' })
    await recorder.close()
    expect(writer.events.map(({ seq }) => seq)).toEqual([1])
  })

  it('rejects an event whose payload getter starts close', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    recorder.record({ source: 's', payload: 'accepted' })
    expect(() =>
      recorder.record({
        source: 's',
        get payload() {
          void recorder.close()
          return 'unfinished'
        },
      }),
    ).toThrow()
    await recorder.close()
    expect(writer.events.map(({ seq, payload }) => [seq, payload])).toEqual([
      [1, 'accepted'],
    ])
    expect(writer.closed).toBe(true)
  })

  it('rejects nested preparation without consuming metadata or poisoning later records', async () => {
    const writer = new ArrayWriter()
    const recorder = createRecorder({ writer })
    let nestedError: unknown
    recorder.record({
      get source() {
        try {
          recorder.record({ source: 'nested', payload: 'nested' })
        } catch (error) {
          nestedError = error
        }
        return 'outer'
      },
      payload: 'outer',
    })
    recorder.record({ source: 'later', payload: 'later' })
    await recorder.close()
    expect(nestedError).toBeInstanceOf(Error)
    expect(writer.events.map(({ seq, source }) => [seq, source])).toEqual([
      [1, 'outer'],
      [2, 'later'],
    ])
  })

  it('allows Writer callbacks to record while admission remains open', async () => {
    const events: RecordingEnvelope[] = []
    const ref: { current?: Recorder } = {}
    const recorder = createRecorder({
      writer: {
        write(event) {
          events.push(event)
          if (event.seq === 1)
            ref.current!.record({ source: 'callback', payload: 2 })
        },
        close() {},
      },
    })
    ref.current = recorder
    recorder.record({ source: 'initial', payload: 1 })
    await Promise.resolve()
    await recorder.close()
    expect(events.map(({ seq, source }) => [seq, source])).toEqual([
      [1, 'initial'],
      [2, 'callback'],
    ])
  })

  it('does not consume elapsed-time origin or sequence when an oversized event is rejected', async () => {
    const times = [10, 250]
    const now = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => times.shift()!)
    try {
      const writer = new ArrayWriter()
      const canonical =
        '{"version":1,"seq":1,"timestamp":"2000-01-01T00:00:00.000Z","elapsedMs":0,"source":"s","payload":"small"}\n'
      const smallEventBytes = Buffer.byteLength(canonical)
      const recorder = createRecorder({
        writer,
        maxBufferedBytes: smallEventBytes,
      })

      expect(() =>
        recorder.record({ source: 's', payload: 'x'.repeat(200) }),
      ).toThrow()
      recorder.record({ source: 's', payload: 'small' })
      await recorder.close()

      expect(
        writer.events.map(({ seq, elapsedMs }) => ({ seq, elapsedMs })),
      ).toEqual([{ seq: 1, elapsedMs: 0 }])
    } finally {
      now.mockRestore()
    }
  })

  it('preserves canonical JSONL UTF-8 accounting and overflow metadata', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10)
    try {
      const canonical = `${JSON.stringify({ version: 1, seq: 1, timestamp: '2000-01-01T00:00:00.000Z', elapsedMs: 0, source: 's', payload: 'é' })}\n`
      const bytesPerEvent = Buffer.byteLength(canonical)
      const overflow = createRecorder({
        writer: new ArrayWriter(),
        maxBufferedBytes: bytesPerEvent - 1,
      })
      expect(() => overflow.record({ source: 's', payload: 'é' })).toThrow()
      await overflow.close()

      const firstGate = deferred()
      const secondGate = deferred()
      const firstStarted = deferred()
      const secondStarted = deferred()
      const events: RecordingEnvelope[] = []
      const writer: Writer = {
        write(event) {
          events.push(event)
          if (event.seq === 1) {
            firstStarted.resolve()
            return firstGate.promise
          }
          if (event.seq === 2) {
            secondStarted.resolve()
            return secondGate.promise
          }
        },
        close() {},
      }
      const recorder = createRecorder({
        writer,
        maxBufferedBytes: bytesPerEvent * 2,
      })
      recorder.record({ source: 's', payload: 'é' })
      recorder.record({ source: 's', payload: 'é' })
      await firstStarted.promise
      expect(() => recorder.record({ source: 's', payload: 'é' })).toThrow()

      firstGate.resolve()
      await secondStarted.promise
      recorder.record({ source: 's', payload: 'é' })
      expect(() => recorder.record({ source: 's', payload: 'é' })).toThrow()
      secondGate.resolve()
      await recorder.close()
      expect(events.map(({ seq }) => seq)).toEqual([1, 2, 3])
    } finally {
      now.mockRestore()
    }
  })

  it('preserves public close identity and write-failure precedence', async () => {
    const failure = new Error('write failed')
    const recorder = createRecorder({
      writer: {
        write() {
          throw failure
        },
        close() {
          throw new Error('close failed')
        },
      },
    })
    recorder.record({ source: 's', payload: 1 })
    const closing = recorder.close()
    expect(recorder.close()).toBe(closing)
    await expect(closing).rejects.toBe(failure)
    expect(() => recorder.record({ source: 's', payload: undefined })).toThrow(
      failure,
    )
  })
})
