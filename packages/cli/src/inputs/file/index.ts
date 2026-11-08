import type { Recorder } from '@event-tape/sdk'
import type { InputDefinition, RunningInput } from '../input.js'
import { startFile } from './follow.js'
import { resolveOptions, type FileOptions } from './options.js'

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
