import { open, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import type { RecordingEnvelope } from "@event-tape/recording-format"

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

export async function createRecorder({
  file,
  maxBufferedBytes = 16 * 1024 * 1024,
  onError,
}: RecorderOptions): Promise<Recorder> {
  const target = resolve(file)
  await mkdir(dirname(target), { recursive: true })
  const handle = await open(target, 'wx')
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
      if (snapshot === undefined)
        throw new TypeError('payload must be JSON-serializable')
      const now = performance.now()
      const timestamp = new Date().toISOString()
      const started = startedAt ?? now
      const envelope: RecordingEnvelope = {
        version: 1,
        seq: seq + 1,
        timestamp,
        elapsedMs: now - started,
        source: input.source,
        ...(input.direction === undefined
          ? {}
          : { direction: input.direction }),
        payload: JSON.parse(snapshot) as unknown,
      }
      const line = `${JSON.stringify(envelope)}\n`
      const bytes = Buffer.byteLength(line)
      if (bufferedBytes + bytes > maxBufferedBytes)
        throw new Error(`recorder buffer limit of ${maxBufferedBytes} bytes exceeded`)
      seq += 1
      startedAt = started
      bufferedBytes += bytes
      queue = queue.then(async () => {
        try {
          if (failure) return
          await handle.write(line)
        } catch (error) {
          failure ??= error instanceof Error ? error : new Error(String(error))
          try {
            onError?.(failure)
          } catch {
            // The write failure remains authoritative if an error handler throws.
          }
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
        await handle.close()
        if (failure) throw failure
      })()
      return closePromise
    },
  }
}
