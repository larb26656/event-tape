import { createRecorder } from '@event-tape/sdk'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { recordCommand } from './record.js'

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
})

it('stops the actual HTTP session when an accepted write fails asynchronously', async () => {
  let address = ''
  const closed = Promise.withResolvers<void>()
  vi.spyOn(console, 'log').mockImplementation((message: string) => {
    if (message.startsWith('Listening: ')) address = message.slice('Listening: '.length)
  })
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  await recordCommand({ handler: 'http', port: '0' }, (_file, onError) => createRecorder({
    writer: {
      write() { throw new Error('disk failed') },
      close() { closed.resolve() },
    },
    onError,
  }))
  try { await fetch(address, { method: 'POST', body: 'event' }) } catch { /* shutdown can close the response */ }
  await closed.promise
  await vi.waitFor(() => expect(process.exitCode).toBe(1))
  expect(errors).toHaveBeenCalledWith(expect.stringContaining('disk failed'))
  await expect(fetch(address)).rejects.toThrow()
})

it('stops rather than acknowledging an event rejected by the bounded write queue', async () => {
  let address = ''
  const closed = Promise.withResolvers<void>()
  vi.spyOn(console, 'log').mockImplementation((message: string) => {
    if (message.startsWith('Listening: ')) address = message.slice('Listening: '.length)
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await recordCommand({ handler: 'http', port: '0' }, (_file, onError) => createRecorder({
    maxBufferedBytes: 1,
    writer: { write() {}, close() { closed.resolve() } },
    onError,
  }))
  const status = await fetch(address, { method: 'POST', body: 'event' }).then((response) => response.status, () => 0)
  expect(status).not.toBe(204)
  await closed.promise
  await vi.waitFor(() => expect(process.exitCode).toBe(1))
  await expect(fetch(address)).rejects.toThrow()
})


it('retries an automatically generated collision without modifying the existing file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'event-tape-collision-'))
  const existing = join(directory, 'existing.jsonl')
  const next = join(directory, 'next.jsonl')
  const closed = Promise.withResolvers<void>()
  try {
    await writeFile(existing, 'keep this\n')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    let candidates = 0
    await recordCommand({ handler: 'http', port: '0' }, (file, onError) => {
      const recorder = createRecorder({ file, onError })
      return {
        record: recorder.record,
        async close() {
          await recorder.close()
          closed.resolve()
        },
      }
    }, () => candidates++ === 0 ? existing : next)
    process.emit('SIGINT', 'SIGINT')
    await closed.promise
    expect(candidates).toBe(2)
    expect(await readFile(existing, 'utf8')).toBe('keep this\n')
    expect(await readFile(next, 'utf8')).toBe('')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})