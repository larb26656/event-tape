import { open, type FileHandle } from 'node:fs/promises'
import { constants, fstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { Recorder } from '@event-tape/sdk'
import type { InputDefinition, RunningInput } from '../input.js'

const MAX_LINE = 1_048_576
const schema = z.strictObject({
  paths: z.array(z.string().min(1)).min(1),
  fromStart: z.boolean().default(false),
})
type FileOptions = z.output<typeof schema>

function resolveOptions(preset: Record<string, unknown>, overrides: Record<string, unknown>): FileOptions {
  const options = { ...preset }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) options[key === 'path' ? 'paths' : key] = value
  }
  const result = schema.safeParse(options)
  if (!result.success) {
    const issue = result.error.issues[0]!
    if (issue.code === 'unrecognized_keys') throw new Error(`unknown file option: ${issue.keys.join(', ')}`)
    throw new Error(`${issue.path.join('.') || 'file options'}: ${issue.message}`)
  }
  return { ...result.data, paths: result.data.paths.map((path) => resolve(path)) }
}

async function startFile(path: string, options: FileOptions, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningInput> {
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
    let pending: string[] = []
    let length = 0
    let lastByte: number | undefined
    let decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    let stopping = false
    let forced = false
    let failed = false
    let boundary = 0
    let timer: NodeJS.Timeout | undefined
    let inFlight: Promise<void> = Promise.resolve()
    let stopPromise: Promise<void> | undefined
    const buffer = Buffer.allocUnsafe(64 * 1024)
    const emit = (partial: boolean) => {
      if (length > MAX_LINE && (partial || lastByte !== 13)) throw new Error(`line exceeds ${MAX_LINE} bytes`)
      pending.push(decoder.decode())
      let text = pending.join('')
      if (!partial && lastByte === 13) text = text.slice(0, -1)
      recorder.record({ source: 'file', payload: { path, text, partial } })
      pending = []
      length = 0
      lastByte = undefined
      decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    }
    const add = (chunk: Buffer) => {
      let start = 0
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start)
        const end = newline < 0 ? chunk.length : newline
        if (!skipping) {
          const part = chunk.subarray(start, end)
          if (part.length) {
            length += part.length
            lastByte = part.at(-1)
          }
          if (length > MAX_LINE + 1 || (length === MAX_LINE + 1 && lastByte !== 13))
            throw new Error(`line exceeds ${MAX_LINE} bytes`)
          if (part.length) pending.push(decoder.decode(part, { stream: true }))
          if (newline >= 0) emit(false)
        } else if (newline >= 0) skipping = false
        if (newline < 0) break
        start = newline + 1
      }
    }
    const readTo = async (file: FileHandle, end: number) => {
      while (!forced && position < end) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, end - position), position)
        if (!bytesRead) break
        position += bytesRead
        add(buffer.subarray(0, bytesRead))
      }
    }
    const finishGeneration = () => {
      if (!skipping && length) emit(true)
      skipping = false
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

async function start(options: FileOptions, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningInput> {
  const files: RunningInput[] = []
  try {
    for (const path of options.paths) files.push(await startFile(path, options, recorder, fatal))
  } catch (error) {
    for (const file of files) file.forceStop()
    throw error
  }
  return {
    async stop() {
      const results = await Promise.allSettled(files.map((file) => file.stop()))
      const failure = results.find((result) => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    },
    forceStop() {
      for (const file of files) file.forceStop()
    },
  }
}

export const fileInput: InputDefinition<FileOptions> = {
  name: 'file',
  description: 'Record lines appended to a file',
  presets: {},
  configureOptions(command) {
    command
      .option('--preset <name>', 'builtin preset')
      .option('--preset-file <file>', 'plain YAML preset file')
      .option('--path <path>', 'file to follow', (path: string, paths: string[]) => [...(paths ?? []), path])
      .option('--from-start', 'read existing content from the beginning')
  },
  resolve: resolveOptions,
  start,
}
