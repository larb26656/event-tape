import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cli } from './test-support/cli.js'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-cli-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('event-tape executable', () => {
  it('handles informational and invalid invocations without starting a server', () => {
    for (const args of [['--help'], ['--version'], ['view'], ['--invalid']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.stdout).not.toContain('Event Tape Player:')
      expect(result.status).toBe(args[0] === '--help' || args[0] === '--version' ? 0 : 1)
    }
  })

  it('scopes session and HTTP options in command help', () => {
    const record = spawnSync(process.execPath, [cli, 'record', '--help'], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    const http = spawnSync(process.execPath, [cli, 'record', 'http', '--help'], { cwd: dir, encoding: 'utf8', timeout: 5000 })
    expect(record.error).toBeUndefined()
    expect(http.error).toBeUndefined()
    expect(record.status).toBe(0)
    expect(http.status).toBe(0)
    expect(record.stdout).toContain('--output')
    expect(record.stdout).toContain('--shutdown-timeout')
    expect(record.stdout).toContain('http')
    expect(record.stdout).not.toContain('--preset')
    expect(record.stdout).not.toContain('--port')
    expect(http.stdout).toContain('--preset')
    expect(http.stdout).toContain('--preset-file')
    expect(http.stdout).toContain('--port')
    expect(http.stdout).not.toContain('--output')
    expect(http.stdout).not.toContain('--shutdown-timeout')
  })

  it('rejects the removed handler selector and unscoped HTTP options', () => {
    for (const args of [['record', '--handler', 'http'], ['record', '--preset', 'otel'], ['record', '--port', '0']]) {
      const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', timeout: 5000 })
      expect(result.error).toBeUndefined()
      expect(result.status).not.toBe(0)
    }
  })
})
