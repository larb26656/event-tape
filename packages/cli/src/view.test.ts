import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cli } from './test-support/cli.js'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'event-tape-cli-view-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('event-tape view executable', () => {
  for (const prefix of [[], ['view']]) {
    it(`serves the packaged Player and recording using ${prefix.length ? 'view' : 'filename shorthand'}`, async () => {
      const recording = join(dir, 'recording.jsonl')
      await writeFile(recording, '')
      const child = spawn(process.execPath, [cli, ...prefix, recording, '--no-browser'], { cwd: dir })
      try {
        const { promise, resolve, reject } = Promise.withResolvers<string>()
        child.once('error', reject)
        child.once('exit', (code) => reject(new Error(`CLI exited: ${code}`)))
        child.stdout.once('data', (data: Buffer) => {
          const match = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/)
          if (match) resolve(match[0]); else reject(new Error(data.toString()))
        })
        const url = await promise
        const html = await (await fetch(url)).text()
        expect(html).toContain('<!doctype html>')
        expect((await fetch(`${url}/recording-metadata.json`)).status).toBe(200)
        expect(await (await fetch(`${url}/recording.jsonl`)).text()).toBe('')
        const script = html.match(/src="([^"]+\.js)"/)
        expect(script).not.toBeNull()
        expect((await fetch(new URL(script![1], url))).status).toBe(200)
      } finally { child.kill() }
    })
  }
})
