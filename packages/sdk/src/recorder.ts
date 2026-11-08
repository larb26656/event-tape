import { performance } from 'node:perf_hooks'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { createFileWriter } from './writers/file-writer.js'
import type { Writer } from './writers/writer.js'
import { createWritePipeline } from './write-pipeline.js'

export interface RecorderInput {
  source: string
  direction?: string
  payload: unknown
}
interface RecorderBaseOptions {
  maxBufferedBytes?: number
  onError?: (error: Error) => void
}
export type RecorderOptions = RecorderBaseOptions &
  ({ file: string; writer?: never } | { writer: Writer; file?: never })
export interface Recorder {
  record(input: RecorderInput): void
  close(): Promise<void>
}

export function createRecorder(options: RecorderOptions): Recorder {
  const hasFile = 'file' in options && options.file !== undefined
  const hasWriter = 'writer' in options && options.writer !== undefined
  if (hasFile === hasWriter)
    throw new TypeError('provide exactly one of file or writer')
  const { maxBufferedBytes = 16 * 1024 * 1024, onError } = options
  const writer: Writer = hasWriter
    ? options.writer
    : createFileWriter({ file: options.file })
  let seq = 0
  let startedAt: number | undefined
  let preparing = false
  const pipeline = createWritePipeline(writer, maxBufferedBytes, onError)
  return {
    record(input) {
      pipeline.assertAccepting()
      if (preparing) throw new Error('recorder is preparing another event')
      preparing = true
      try {
        const snapshot = JSON.stringify(input.payload)
        if (snapshot === undefined || !isLosslessJson(input.payload))
          throw new TypeError(
            'payload must be JSON-serializable without lossy values',
          )
        const now = performance.now()
        const started = startedAt ?? now
        const envelope: RecordingEnvelope = {
          version: 1,
          seq: seq + 1,
          timestamp: new Date().toISOString(),
          elapsedMs: now - started,
          source: input.source,
          ...(input.direction === undefined
            ? {}
            : { direction: input.direction }),
          payload: JSON.parse(snapshot) as unknown,
        }
        const bytes = Buffer.byteLength(`${JSON.stringify(envelope)}\n`)
        pipeline.enqueue(envelope, bytes)
        seq += 1
        startedAt = started
      } finally {
        preparing = false
      }
    },
    close() {
      return pipeline.close()
    },
  }
}

function isLosslessJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isLosslessJson)
  if (typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.keys(value).every((key) =>
    isLosslessJson((value as Record<string, unknown>)[key]),
  )
}
