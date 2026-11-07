import { close as closeCallback, mkdirSync, openSync, write as writeCallback } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { RecordingEnvelope } from '@event-tape/recording-format'

export interface RecorderInput {
  source: string
  direction?: string
  payload: unknown
}
export interface RecorderOptions {
  file: string
  maxBufferedBytes?: number
  onError?: (error: Error) => void
}
export interface Recorder {
  record(input: RecorderInput): void
  close(): Promise<void>
}

export function createRecorder({ file, maxBufferedBytes = 16 * 1024 * 1024, onError }: RecorderOptions): Recorder {
  const target = resolve(file)
  mkdirSync(dirname(target), { recursive: true })
  const descriptor = openSync(target, 'wx')
  let seq = 0
  let startedAt: number | undefined
  let queue: Promise<void> = Promise.resolve()
  let bufferedBytes = 0
  let failure: Error | undefined
  let closing = false
  let closePromise: Promise<void> | undefined
  return {
    record(input) {
      if (failure) throw failure
      if (closing) throw new Error('recorder is closed')
      const snapshot = JSON.stringify(input.payload)
      if (snapshot === undefined || !isLosslessJson(input.payload)) throw new TypeError('payload must be JSON-serializable without lossy values')
      const now = performance.now()
      const started = startedAt ?? now
      const envelope: RecordingEnvelope = {
        version: 1, seq: seq + 1, timestamp: new Date().toISOString(), elapsedMs: now - started,
        source: input.source, ...(input.direction === undefined ? {} : { direction: input.direction }),
        payload: JSON.parse(snapshot) as unknown,
      }
      const line = `${JSON.stringify(envelope)}\n`
      const bytes = Buffer.byteLength(line)
      if (bufferedBytes + bytes > maxBufferedBytes) throw new Error(`recorder buffer limit of ${maxBufferedBytes} bytes exceeded`)
      seq += 1
      startedAt = started
      bufferedBytes += bytes
      queue = queue.then(async () => {
        try {
          if (!failure) await writeAll(descriptor, Buffer.from(line))
        } catch (error) {
          failure ??= error instanceof Error ? error : new Error(String(error))
          try { onError?.(failure) } catch { /* Keep the write failure authoritative. */ }
        } finally {
          bufferedBytes -= bytes
        }
      })
    },
    close() {
      if (closePromise) return closePromise
      closing = true
      closePromise = (async () => {
        await queue
        await closeDescriptor(descriptor)
        if (failure) throw failure
      })()
      return closePromise
    },
  }
}

function isLosslessJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isLosslessJson)
  if (typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.keys(value).every((key) => isLosslessJson((value as Record<string, unknown>)[key]))
}

function writeAll(descriptor: number, bytes: Buffer): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    let offset = 0
    const writeNext = () => {
      writeCallback(descriptor, bytes, offset, bytes.length - offset, null, (error, bytesWritten) => {
        if (error) { rejectWrite(error); return }
        if (bytesWritten <= 0) { rejectWrite(new Error('file write made no progress')); return }
        offset += bytesWritten
        if (offset < bytes.length) writeNext()
        else resolveWrite()
      })
    }
    writeNext()
  })
}

function closeDescriptor(descriptor: number): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    closeCallback(descriptor, (error) => error ? rejectClose(error) : resolveClose())
  })
}
