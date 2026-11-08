import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseRecordingJsonl } from '@event-tape/recording-format'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecorder } from './index.js'

let directory = ''
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('Recorder file integration', () => {
  it('records snapshotted, ordered events to a real file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'event-tape-recorder-'))
    const file = join(directory, 'recording.jsonl')
    const recorder = createRecorder({ file })
    const payload = { nested: { value: 1 } }
    recorder.record({ source: 'listener', direction: 'incoming', payload })
    payload.nested.value = 2
    recorder.record({
      source: 'listener',
      direction: 'outgoing',
      payload: { value: 'second' },
    })
    await recorder.close()

    const result = parseRecordingJsonl(await readFile(file, 'utf8'))
    expect(result.warning).toBeUndefined()
    expect(result.events).toHaveLength(2)
    expect(result.events.map(({ seq }) => seq)).toEqual([1, 2])
    expect(result.events.map(({ version }) => version)).toEqual([1, 1])
    expect(result.events.map(({ source }) => source)).toEqual([
      'listener',
      'listener',
    ])
    expect(
      result.events.every(
        ({ timestamp, elapsedMs }) =>
          Number.isFinite(Date.parse(timestamp)) && elapsedMs >= 0,
      ),
    ).toBe(true)
    expect(result.events.map(({ direction }) => direction)).toEqual([
      'incoming',
      'outgoing',
    ])
    expect(result.events[0]?.payload).toEqual({ nested: { value: 1 } })
    expect(result.events[1]?.payload).toEqual({ value: 'second' })
  })
})
