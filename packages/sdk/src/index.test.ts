import { parseRecordingJsonl } from '@event-tape/recording-format'
import type * as NodeFs from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecorder } from './index.js'
const writeControl = vi.hoisted(() => ({
  mode: 'normal' as 'normal' | 'partial' | 'error',
  calls: 0,
  error: null as Error | null,
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>()
  return {
    ...actual,
    write: vi.fn((
      fd: number,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number | null,
      callback: (error: NodeJS.ErrnoException | null, bytesWritten: number, buffer: Uint8Array) => void,
    ) => {
      writeControl.calls += 1
      if (writeControl.mode === 'error') {
        callback(writeControl.error as NodeJS.ErrnoException, 0, buffer)
        return
      }
      const writeLength = writeControl.mode === 'partial' ? Math.max(1, Math.floor(length / 2)) : length
      actual.write(fd, buffer, offset, writeLength, position, callback)
    }),
  }
})

let directory: string
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('createRecorder', () => {
  it('opens synchronously and throws immediately when the destination cannot be opened', () => {
    directory = '/path-that-does-not-exist/event-tape'
    expect(() => createRecorder({ file: join(directory, 'recording.jsonl') })).toThrow()
  })
  it('snapshots synchronously and writes ordered v1 JSONL using elapsed monotonic time', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'nested', 'recording.jsonl')
    const recorder = createRecorder({ file })
    const payload = { id: 'original' }
    recorder.record({ source: 'listener', payload })
    payload.id = 'mutated'
    recorder.record({ source: 'another', direction: 'unclassified', payload: { ok: true } })
    await recorder.close()
    const events = parseRecordingJsonl(await readFile(file, 'utf8')).events
    expect(events).toMatchObject([
      { version: 1, seq: 1, elapsedMs: 0, source: 'listener', payload: { id: 'original' } },
      { version: 1, seq: 2, elapsedMs: expect.any(Number), source: 'another', direction: 'unclassified', payload: { ok: true } },
    ])
    expect(events[1]?.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('completes partial writes before closing', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'partial.jsonl')
    const recorder = createRecorder({ file })
    writeControl.mode = 'partial'
    writeControl.calls = 0
    recorder.record({ source: 's', payload: { text: 'partial writes must be completed' } })
    await recorder.close()
    expect(JSON.parse(await readFile(file, 'utf8')).payload).toEqual({ text: 'partial writes must be completed' })
    expect(writeControl.calls).toBeGreaterThan(1)
    writeControl.mode = 'normal'
  })

  it('accepts an event exactly at the byte limit and drains it after rejecting an oversized event', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'bounded.jsonl')
    const exactBytes = Buffer.byteLength(`${JSON.stringify({ version: 1, seq: 1, timestamp: '2000-01-01T00:00:00.000Z', elapsedMs: 0, source: 's', payload: 'ok' })}\n`)
    const recorder = createRecorder({ file, maxBufferedBytes: exactBytes })
    recorder.record({ source: 's', payload: 'ok' })
    expect(() => recorder.record({ source: 's', payload: 'x'.repeat(2048) })).toThrow(/buffer limit/)
    await recorder.close()
    expect((await readFile(file, 'utf8')).trim().split('\n')).toHaveLength(1)
  })

  it('throws serialization failures synchronously without consuming sequence numbers', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'serialize.jsonl')
    const recorder = createRecorder({ file })
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => recorder.record({ source: 's', payload: circular })).toThrow()
    recorder.record({ source: 's', payload: 'ok' })
    await recorder.close()
    expect(JSON.parse(await readFile(file, 'utf8')).seq).toBe(1)
  })

  it('rejects nested values that JSON would silently omit or rewrite', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'invalid.jsonl')
    const recorder = createRecorder({ file })
    expect(() => recorder.record({ source: 's', payload: { value: undefined } })).toThrow()
    expect(() => recorder.record({ source: 's', payload: { value: Number.NaN } })).toThrow()
    await recorder.close()
    expect(await readFile(file, 'utf8')).toBe('')
  })

  it('returns the same close promise and rejects records after close starts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const recorder = createRecorder({ file: join(directory, 'close.jsonl') })
    const closing = recorder.close()
    expect(recorder.close()).toBe(closing)
    expect(() => recorder.record({ source: 's', payload: 'late' })).toThrow(/closed/)
    await closing
  })

  it('reports async write failures and rejects subsequent records and close', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'failure.jsonl')
    const onError = vi.fn()
    const recorder = createRecorder({ file, onError })
    const failure = new Error('disk failed')
    writeControl.mode = 'error'
    writeControl.error = failure
    recorder.record({ source: 's', payload: 'first' })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
    expect(() => recorder.record({ source: 's', payload: 'later' })).toThrow(failure)
    await expect(recorder.close()).rejects.toBe(failure)
    expect(onError).toHaveBeenCalledTimes(1)
    writeControl.mode = 'normal'
    writeControl.error = null
  })

  it('rejects existing files synchronously without changing them', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'existing.jsonl')
    await writeFile(file, 'original')
    expect(() => createRecorder({ file })).toThrow()
    expect(await readFile(file, 'utf8')).toBe('original')
    const recorder = createRecorder({ file: join(directory, 'new.jsonl') })
    expect(() => recorder.record({ source: 'listener', payload: undefined })).toThrow(/JSON-serializable/)
    await recorder.close()
  })
})
