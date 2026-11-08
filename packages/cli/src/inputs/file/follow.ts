import { open, type FileHandle } from 'node:fs/promises'
import { constants, fstatSync } from 'node:fs'
import type { Recorder } from '@event-tape/sdk'
import type { RunningInput } from '../input.js'
import type { FileOptions } from './options.js'
import { createLineParser } from './lines.js'

export async function startFile(path: string, options: FileOptions, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningInput> {
  let handle: FileHandle | undefined
  let position = 0
  let skipping = false
  try {
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (handle) {
      const stat = await handle.stat()
      if (!stat.isFile()) throw new Error('not a regular file')
      position = options.fromStart ? 0 : stat.size
      if (position > 0) {
        const last = Buffer.alloc(1)
        const result = await handle.read(last, 0, 1, position - 1)
        if (result.bytesRead !== 1) throw new Error('could not read initial position')
        skipping = last[0] !== 10
      }
    }
    const { add, finishGeneration } = createLineParser(skipping, (text, partial) => {
      let payload: { path: string; partial: boolean; text: string } | { path: string; partial: boolean; json: unknown } = { path, text, partial }
      if (!partial) {
        try {
          const json: unknown = JSON.parse(text)
          payload = { path, json, partial }
        } catch {
          // Preserve lines that are not valid JSON.
        }
      }
      recorder.record({ source: 'file', payload })
    })
    let stopping = false
    let forced = false
    let failed = false
    let boundary = 0
    let timer: NodeJS.Timeout | undefined
    let inFlight: Promise<void> = Promise.resolve()
    let stopPromise: Promise<void> | undefined
    const buffer = Buffer.allocUnsafe(64 * 1024)
    const readTo = async (file: FileHandle, end: number) => {
      while (!forced && position < end) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, end - position), position)
        if (!bytesRead) break
        position += bytesRead
        add(buffer.subarray(0, bytesRead))
      }
    }
    const inspect = async () => {
      let candidate: FileHandle | undefined
      try {
        try {
          candidate = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          if (!stopping && handle) {
            finishGeneration()
            const old = handle
            handle = undefined
            position = 0
            await old.close()
          }
          return
        }
        const stat = await candidate.stat()
        if (!stat.isFile()) throw new Error('not a regular file')
        if (stopping || forced) return
        if (handle) {
          const old = await handle.stat()
          if (stopping || forced) return
          if (old.dev !== stat.dev || old.ino !== stat.ino || stat.size < position) {
            finishGeneration()
            const previous = handle
            handle = undefined
            position = 0
            await previous.close()
          }
        }
        if (stopping || forced) return
        if (!handle) {
          handle = candidate
          candidate = undefined
          position = 0
        }
        await readTo(handle, stat.size)
      } finally {
        await candidate?.close()
      }
    }
    const schedule = () => {
      if (stopping || forced || failed) return
      timer = setTimeout(() => {
        inFlight = inspect().catch((error: unknown) => {
          failed = true
          if (!forced) fatal(new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }))
        }).finally(schedule)
      }, 50)
    }
    schedule()
    return {
      stop() {
        if (stopPromise) return stopPromise
        stopping = true
        clearTimeout(timer)
        const file = handle
        try { if (file) boundary = fstatSync(file.fd).size } catch (error) {
          stopPromise = Promise.reject(new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error }))
          void file?.close()
          return stopPromise
        }
        stopPromise = (async () => {
          try {
            await inFlight
            if (!failed && file) {
              await readTo(file, boundary)
              if (!forced) finishGeneration()
            }
          } catch (error) {
            throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
          } finally { await handle?.close() }
        })()
        return stopPromise
      },
      forceStop() {
        forced = true
        stopping = true
        clearTimeout(timer)
        void handle?.close().catch(() => {})
      },
    }
  } catch (error) {
    await handle?.close()
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

