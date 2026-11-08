import { randomInt } from 'node:crypto'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
import { createRecorder } from '@event-tape/sdk'
import type { Recorder } from '@event-tape/sdk'
import { inputRegistry } from './inputs/registry.js'
import type { RunningInput } from './inputs/input.js'

const words = ['amber', 'birch', 'cedar', 'cloud', 'fern', 'maple', 'river', 'stone']

function outputName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return resolve('.tape', `${timestamp}-${words[randomInt(words.length)]}.jsonl`)
}

export interface RecordCommandOptions {
  input?: string
  preset?: string
  presetFile?: string
  [option: string]: unknown
  output?: string
  shutdownTimeout?: string
}
export async function recordCommand(
  options: RecordCommandOptions,
  makeRecorder: (file: string, onError: (error: Error) => void) => Recorder =
    (file, onError) => createRecorder({ file, onError }),
  makeOutputName: () => string = outputName,
): Promise<void> {
  if (options.preset !== undefined && options.presetFile !== undefined)
    throw new Error('select at most one of --preset or --preset-file')
  const input = inputRegistry.get(options.input)
  if (!input) throw new Error(`input: unknown input ${options.input}`)
  let raw: Record<string, unknown> = {}
  if (options.preset !== undefined) {
    if (!Object.hasOwn(input.presets, options.preset))
      throw new Error(`preset: unknown builtin ${options.preset} for input ${input.name}`)
    raw = input.presets[options.preset]
  } else if (options.presetFile !== undefined) {
    let document
    try {
      document = parseDocument(await readFile(options.presetFile, 'utf8'), { uniqueKeys: true })
      if (document.errors.length) throw document.errors[0]
      const preset: unknown = document.toJS({ maxAliasCount: 0 })
      if (!preset || typeof preset !== 'object' || Array.isArray(preset))
        throw new Error('preset must be a mapping')
      const fields = preset as Record<string, unknown>
      for (const key of Object.keys(fields)) {
        if (key !== 'input' && key !== 'options') throw new Error(`unknown preset field: ${key}`)
      }
      if (typeof fields.input !== 'string' || !fields.input) throw new Error('input must be a non-empty string')
      if (fields.options !== undefined && (!fields.options || typeof fields.options !== 'object' || Array.isArray(fields.options)))
        throw new Error('options must be a mapping')
      if (fields.input !== input.name)
        throw new Error(`input ${fields.input} does not match selected input ${input.name}`)
      raw = (fields.options ?? {}) as Record<string, unknown>
    } catch (error) {
      throw new Error(`preset-file: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
  const overrides = { ...options }
  for (const key of ['input', 'preset', 'presetFile', 'output', 'shutdownTimeout']) delete overrides[key]
  const resolved = input.resolve(raw, overrides)
  const timeout = options.shutdownTimeout === undefined ? 10_000 : Number(options.shutdownTimeout)
  if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647 || (options.shutdownTimeout !== undefined && String(timeout) !== options.shutdownTimeout))
    throw new Error('shutdown-timeout: expected an integer between 1 and 2147483647 milliseconds')

  let failure: Error | undefined
  let running: RunningInput | undefined
  let shutdownRequested = false
  let shutdownPromise: Promise<void> | undefined
  let recorder: Recorder
  let output: string
  const fatal = (error: Error) => {
    failure ??= error
    void shutdown()
  }
  function shutdown(): Promise<void> {
    shutdownRequested = true
    if (!running) return Promise.resolve()
    if (shutdownPromise) return shutdownPromise
    const current = running
    shutdownPromise = (async () => {
      const deadline = setTimeout(() => {
        current.forceStop()
        console.error('Shutdown deadline exceeded; recording may be incomplete')
        process.exit(1)
      }, timeout)
      try {
        try {
          await current.stop()
        } catch (error) {
          failure ??= error instanceof Error ? error : new Error(String(error))
          current.forceStop()
        }
        await recorder.close()
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error))
      } finally {
        clearTimeout(deadline)
        process.off('SIGINT', interrupt)
        process.off('SIGTERM', interrupt)
      }
      if (failure) {
        console.error(`Recording failed: ${failure.message}`)
        process.exitCode = 1
      }
    })()
    return shutdownPromise
  }
  function interrupt() { void shutdown() }

  // FileWriter performs atomic exclusive creation. Retry only generated-name collisions.
  for (;;) {
    output = options.output === undefined ? makeOutputName() : resolve(options.output)
    try {
      recorder = makeRecorder(output, fatal)
      break
    } catch (error) {
      if (options.output === undefined && (error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  try {
    running = await input.start(resolved, recorder, fatal)
  } catch (error) {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    await recorder.close()
    throw error
  }
  if (shutdownRequested) {
    await shutdown()
    return
  }
  if (running.address !== undefined) console.log(`Listening: ${running.address}`)
  console.log(`Recording: ${output}`)
}
