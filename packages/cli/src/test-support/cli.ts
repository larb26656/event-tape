import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export const cli = fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url))

export interface CliProcess {
  ready(pattern: RegExp): Promise<RegExpMatchArray>
  stop(signal: NodeJS.Signals, requireRunning?: boolean): Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  cleanup(): Promise<void>
  diagnostic(phase: string): string
}

export function startCli(args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...process.env, ...env } })
  let stdout = ''
  let stderr = ''
  let exitStatus = 'running'
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const { promise: exited, resolve: resolveExit, reject: rejectExit } = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  child.once('error', (error) => { exitStatus = error.message; rejectExit(error) })
  child.once('close', (code, signal) => {
    exitStatus = `code=${code}, signal=${signal}`
    resolveExit({ code, signal })
  })
  // Observe spawn errors immediately, even if readiness fails before shutdown is awaited.
  void exited.catch(() => {})
  const diagnostic = (phase: string) =>
    `${args.join(' ')}: ${phase}; ${exitStatus}\nstdout: ${stdout}\nstderr: ${stderr}`

  async function ready(pattern: RegExp) {
    const { promise, resolve, reject } = Promise.withResolvers<RegExpMatchArray>()
    // Real deadlines bound external child processes; fake timers cannot control them.
    const timeout = setTimeout(() => finish(new Error(diagnostic('readiness timeout'))), 5000)
    const onData = () => {
      const match = stdout.match(pattern)
      if (match) finish(undefined, match)
    }
    const finish = (error?: Error, match?: RegExpMatchArray) => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      if (error) reject(error)
      else resolve(match!)
    }
    child.stdout.on('data', onData)
    void exited.then(
      () => finish(new Error(diagnostic('exited before readiness'))),
      () => finish(new Error(diagnostic('failed before readiness'))),
    )
    onData()
    return promise
  }

  async function waitForExit() {
    const { promise, reject } = Promise.withResolvers<never>()
    const timer = setTimeout(() => reject(new Error(diagnostic('shutdown timeout'))), 5000)
    try {
      return await Promise.race([exited, promise])
    } finally {
      clearTimeout(timer)
    }
  }

  async function stop(signal: NodeJS.Signals, requireRunning = false) {
    if (requireRunning && (child.exitCode !== null || child.signalCode !== null || exitStatus !== 'running' || !child.kill(signal))) {
      throw new Error(diagnostic('exited before shutdown'))
    }
    if (!requireRunning && exitStatus === 'running') child.kill(signal)
    return waitForExit()
  }

  async function cleanup() {
    try {
      await stop('SIGTERM')
    } catch {
      child.kill('SIGKILL')
      await exited.catch(() => {})
    }
  }

  return { ready, stop, waitForExit, cleanup, diagnostic, signal: (signal: NodeJS.Signals) => child.kill(signal) }
}

export async function waitForRecorded(file: string, text: string, process: CliProcess) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if ((await readFile(file, 'utf8')).includes(text)) return
    // The built CLI is a separate process using real filesystem polling.
    await delay(20)
  }
  throw new Error(process.diagnostic(`waiting for recorded ${text}`))
}
