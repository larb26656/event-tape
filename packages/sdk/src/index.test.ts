import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecorder } from './index.js'

let directory: string
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('createRecorder', () => {
  it('opens synchronously and throws immediately when the destination cannot be opened', () => {
    expect(() => createRecorder({ file: join(tmpdir(), 'missing-parent-event-tape', 'recording.jsonl') })).toThrow()
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
    const lines = (await readFile(file, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    expect(lines).toMatchObject([
      { version: 1, seq: 1, timestamp: expect.any(String), elapsedMs: 0, source: 'listener', payload: { id: 'original' } },
      { version: 1, seq: 2, timestamp: expect.any(String), elapsedMs: expect.any(Number), source: 'another', direction: 'unclassified', payload: { ok: true } },
    ])
    expect(lines[1].elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('accepts an event exactly at the byte limit and drains it after rejecting an oversized event', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'bounded.jsonl')
    const exactBytes = Buffer.byteLength(`${JSON.stringify({ version: 1, seq: 1, timestamp: '2026-11-07T10:00:00.000Z', elapsedMs: 0, source: 's', payload: 'ok' })}\n`)
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
    expect(() => recorder.record({ source: 's', payload: [Number.NaN] })).toThrow()
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
    const onError = vi.fn()
    const recorder = createRecorder({ file: join(directory, 'failure.jsonl'), onError })
    const probe = await open(join(directory, 'probe'), 'wx')
    const failure = new Error('disk failed')
    const writeSpy = vi.spyOn(Object.getPrototypeOf(probe), 'write').mockRejectedValueOnce(failure)
    await probe.close()
    recorder.record({ source: 's', payload: 'first' })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
    expect(() => recorder.record({ source: 's', payload: 'later' })).toThrow(failure)
    await expect(recorder.close()).rejects.toBe(failure)
    expect(onError).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()
  })

  it('rejects unencodable payloads synchronously and leaves existing files untouched', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'existing.jsonl')
    await writeFile(file, 'original')
    await expect(createRecorder({ file })).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(file, 'utf8')).toBe('original')
    const recorder = createRecorder({ file: join(directory, 'new.jsonl') })
    expect(() => recorder.record({ source: 's', payload: 1n })).toThrow()
    await recorder.close()
  })
})
