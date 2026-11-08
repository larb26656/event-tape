import type * as NodeFs from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFileWriter } from './index.js'

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
  writeControl.mode = 'normal'
  writeControl.calls = 0
  writeControl.error = null
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('createFileWriter', () => {
  it('creates parent directories and writes structured events as v1 JSONL', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-writer-'))
    const file = join(directory, 'nested', 'recording.jsonl')
    const writer = createFileWriter({ file })
    await writer.write({ version: 1, seq: 1, timestamp: '2026-01-01T00:00:00.000Z', elapsedMs: 0, source: 'test', payload: { ok: true } })
    await writer.close()

    expect(await readFile(file, 'utf8')).toBe('{"version":1,"seq":1,"timestamp":"2026-01-01T00:00:00.000Z","elapsedMs":0,"source":"test","payload":{"ok":true}}\n')
  })

  it('exclusively creates the destination and throws synchronously on open errors', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-writer-'))
    const existing = join(directory, 'existing.jsonl')
    await writeFile(existing, 'original')
    expect(() => createFileWriter({ file: existing })).toThrow()
    expect(await readFile(existing, 'utf8')).toBe('original')
    const component = join(directory, 'not-a-directory')
    await writeFile(component, 'file')
    expect(() => createFileWriter({ file: join(component, 'recording.jsonl') })).toThrow()
  })

  it('completes partial writes before resolving', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-writer-'))
    const file = join(directory, 'partial.jsonl')
    const writer = createFileWriter({ file })
    writeControl.mode = 'partial'
    await writer.write({ version: 1, seq: 1, timestamp: '2026-01-01T00:00:00.000Z', elapsedMs: 0, source: 'test', payload: 'partial' })
    await writer.close()

    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ seq: 1, payload: 'partial' })
    expect(writeControl.calls).toBeGreaterThan(1)
  })

  it('rejects write failures and still closes the file handle', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-writer-'))
    const file = join(directory, 'failure.jsonl')
    const writer = createFileWriter({ file })
    const failure = Object.assign(new Error('disk failed'), { code: 'EIO' })
    writeControl.mode = 'error'
    writeControl.error = failure
    await expect(writer.write({ version: 1, seq: 1, timestamp: '2026-01-01T00:00:00.000Z', elapsedMs: 0, source: 'test', payload: null })).rejects.toBe(failure)
    await writer.close()
    expect(await readFile(file, 'utf8')).toBe('')
  })
})
