import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecorder } from './index.js'

let directory: string
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('createRecorder', () => {
  it('snapshots synchronously and writes ordered v1 JSONL using elapsed monotonic time', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'nested', 'recording.jsonl')
    const recorder = await createRecorder({ file })
    const payload = { id: 'original' }
    recorder.record({ source: 'listener', payload })
    payload.id = 'mutated'
    recorder.record({
      source: 'another',
      direction: 'unclassified',
      payload: { ok: true },
    })
    await recorder.close()
    const lines = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(lines).toMatchObject([
      {
        version: 1,
        seq: 1,
        elapsedMs: 0,
        source: 'listener',
        payload: { id: 'original' },
      },
      {
        version: 1,
        seq: 2,
        elapsedMs: expect.any(Number),
        source: 'another',
        direction: 'unclassified',
        payload: { ok: true },
      },
    ])
    expect(lines[1].elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects unencodable payloads synchronously and leaves existing files untouched', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-'))
    const file = join(directory, 'existing.jsonl')
    await writeFile(file, 'original')
    await expect(createRecorder({ file })).rejects.toMatchObject({
      code: 'EEXIST',
    })
    const recorder = await createRecorder({
      file: join(directory, 'new.jsonl'),
    })
    expect(() =>
      recorder.record({ source: 'listener', payload: undefined }),
    ).toThrow(/JSON-serializable/)
    await recorder.close()
  })
})
