import { performance } from 'node:perf_hooks'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { createFileWriter } from './writers/file-writer.js'
import type { Writer } from './writers/writer.js'

export interface RecorderInput {
  source: string
  direction?: string
  payload: unknown
}
interface RecorderBaseOptions {
  maxBufferedBytes?: number
  onError?: (error: Error) => void
}
export type RecorderOptions = RecorderBaseOptions & (
  | { file: string; writer?: never }
  | { writer: Writer; file?: never }
)
export interface Recorder {
  record(input: RecorderInput): void
  close(): Promise<void>
}

export function createRecorder(options: RecorderOptions): Recorder {
  const hasFile = 'file' in options && options.file !== undefined
  const hasWriter = 'writer' in options && options.writer !== undefined
  if (hasFile === hasWriter) throw new TypeError('provide exactly one of file or writer')
  const { maxBufferedBytes = 16 * 1024 * 1024, onError } = options
  const writer: Writer = hasWriter
    ? options.writer
    : createFileWriter({ file: options.file })
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
          if (!failure) await writer.write(envelope)
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
        let closeFailed = false
        let closeFailure: unknown
        try { await writer.close() } catch (error) {
          closeFailed = true
          closeFailure = error
        }
        if (failure) throw failure
        if (closeFailed) throw closeFailure
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
