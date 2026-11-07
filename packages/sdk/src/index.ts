import { open, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { RecordingEnvelope } from '@event-tape/recording-format/src/index.js'

export interface RecorderInput {
  source: string
  direction?: string
  payload: unknown
}
export interface RecorderOptions {
  file: string
}
export interface Recorder {
  record(input: RecorderInput): void
  close(): Promise<void>
}

export async function createRecorder({
  file,
}: RecorderOptions): Promise<Recorder> {
  const target = resolve(file)
  await mkdir(dirname(target), { recursive: true })
  const handle = await open(target, 'wx')
  let seq = 0
  let startedAt: number | undefined
  let queue: Promise<void> = Promise.resolve()
  let closed = false
  return {
    record(input) {
      if (closed) throw new Error('recorder is closed')
      const snapshot = JSON.stringify(input.payload)
      if (snapshot === undefined)
        throw new TypeError('payload must be JSON-serializable')
      const now = performance.now()
      const timestamp = new Date().toISOString()
      startedAt ??= now
      const envelope: RecordingEnvelope = {
        version: 1,
        seq: ++seq,
        timestamp,
        elapsedMs: now - startedAt,
        source: input.source,
        ...(input.direction === undefined
          ? {}
          : { direction: input.direction }),
        payload: JSON.parse(snapshot) as unknown,
      }
      const line = `${JSON.stringify(envelope)}\n`
      queue = queue.then(async () => {
        await handle.write(line)
      })
    },
    async close() {
      if (!closed) {
        closed = true
        await queue
        await handle.close()
      } else await queue
    },
  }
}
