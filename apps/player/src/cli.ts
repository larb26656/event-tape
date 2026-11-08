#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { Command, CommanderError } from 'commander'
import { serveRecording } from './local-server.js'

async function launch(recording: string | undefined, browser: boolean, command: Command) {
  if (!recording) command.error('A recording file is required', { code: 'commander.missingArgument' })
  let server
  try {
    server = await serveRecording(recording)
  } catch (error) {
    command.error(`Unable to open recording: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const address = server.address()
  if (address && typeof address !== 'string') {
    const url = `http://127.0.0.1:${address.port}`
    console.log(`Event Tape Player: ${url}`)
    if (browser) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
      const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
      execFile(opener, openerArgs)
    }
  }
}

function configureRoot(command: Command) {
  command
    .option('--no-browser', 'print the local URL without opening a browser')
    .argument('[recording.jsonl]', 'recording file to open')
    .action(async (recording, options, actionCommand) => {
      await launch(recording, options.browser, actionCommand)
    })
}

const program = new Command()
  .name('event-tape')
  .description('Open a recording in the Event Tape Player')
  .version(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version)
configureRoot(program)
program
  .command('view')
  .description('Open a recording in the Event Tape Player')
  .argument('<recording.jsonl>', 'recording file to open')
  .option('--no-browser', 'print the local URL without opening a browser')
  .action(async (recording, options, command) => {
    await launch(recording, options.browser, command)
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode
  else throw error
}
