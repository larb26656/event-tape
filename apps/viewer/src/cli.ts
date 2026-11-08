#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { Command, CommanderError } from 'commander'
import { serveRecording } from './local-server.js'

const program = new Command()
  .name('event-tape')
  .description('Open a recording in the Event Tape Viewer')
  .version('0.0.1')
  .option('--no-browser', 'print the local URL without opening a browser')
  .argument('[recording.jsonl]', 'recording file to open')
  .action(async (recording, options, command) => {
    if (!recording) {
      command.error('A recording file is required', { code: 'commander.missingArgument' })
    }
    let server
    try {
      server = await serveRecording(recording)
    } catch (error) {
      command.error(`Unable to open recording: ${error instanceof Error ? error.message : String(error)}`)
    }
    const address = server.address()
    if (address && typeof address !== 'string') {
      const url = `http://127.0.0.1:${address.port}`
      console.log(`Event Tape Viewer: ${url}`)
      if (options.browser) {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
        const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
        execFile(opener, openerArgs)
      }
    }
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode
  else throw error
}
