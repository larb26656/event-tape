import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecordingLoader } from './recording-loading'
import type { RecordingLoadUpdate } from './recording-loading'

type WorkerResult = {
  events?: []
  warning?: string
  error?: string
}

class ControlledWorker {
  onmessage: ((event: MessageEvent<WorkerResult>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  input: unknown
  terminated = false

  constructor(readonly workers: ControlledWorker[]) {
    workers.push(this)
  }

  postMessage(input: unknown) {
    this.input = input
  }

  terminate() {
    this.terminated = true
  }

  respond(data: WorkerResult) {
    this.onmessage?.({ data } as MessageEvent<WorkerResult>)
  }
}

const workers: ControlledWorker[] = []

function jsonlResponse(text: string): Response {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'application/x-ndjson' }),
    text: async () => text,
  } as Response
}

function metadataResponse(name: string): Response {
  return {
    ok: true,
    json: async () => ({ name }),
  } as Response
}

afterEach(() => {
  workers.length = 0
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shared Recording loading', () => {

  it('keeps a later file selection active when an earlier HTTP acquisition resolves afterward', async () => {
    const { promise: pendingRecording, resolve: resolveRecording } = Promise.withResolvers<Response>()
    vi.stubGlobal('Worker', class extends ControlledWorker {
      constructor() { super(workers) }
    })
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/recording.jsonl'
      ? pendingRecording
      : Promise.resolve(metadataResponse('old.jsonl'))))
    const updates: RecordingLoadUpdate[] = []
    const loader = createRecordingLoader((update) => updates.push(update))

    const earlierLoad = loader.loadInitial(false)
    const latestFile = new File(['new contents'], 'latest.jsonl')
    loader.loadFile(latestFile)
    workers[0].respond({ events: [] })
    resolveRecording(jsonlResponse('old contents'))
    await earlierLoad

    expect(updates.at(-1)).toMatchObject({ type: 'loaded', name: 'latest.jsonl' })
    expect(updates.filter((update) => update.type === 'loaded')).toHaveLength(1)
    expect(workers).toHaveLength(1)
    loader.dispose()
  })

})
