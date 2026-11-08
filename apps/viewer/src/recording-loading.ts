import type { RecordingEnvelope } from '@event-tape/recording-format'

type WorkerResult = {
  events?: RecordingEnvelope[]
  warning?: string
  error?: string
}

export type RecordingLoadUpdate =
  | { type: 'loading' }
  | { type: 'empty' }
  | { type: 'loaded'; name: string; file: File; events: RecordingEnvelope[]; warning: string }
  | { type: 'error'; error: string }

export type RecordingLoader = {
  loadInitial: (development: boolean) => Promise<void>
  loadFile: (file: File) => void
  dispose: () => void
}

export function createRecordingLoader(
  onUpdate: (update: RecordingLoadUpdate) => void,
): RecordingLoader {
  let requestId = 0
  let worker: Worker | null = null

  const begin = () => {
    requestId += 1
    worker?.terminate()
    worker = null
    onUpdate({ type: 'loading' })
    return requestId
  }

  const isCurrent = (id: number) => requestId === id

  const startWorker = (id: number, file: File, input: File | { text: string }) => {
    if (!isCurrent(id)) return

    let activeWorker: Worker
    try {
      activeWorker = new Worker(
        new URL('./recording.worker.ts', import.meta.url),
        { type: 'module' },
      )
    } catch (error) {
      onUpdate({ type: 'error', error: String(error) })
      return
    }
    worker = activeWorker

    const fail = (error: string) => {
      if (!isCurrent(id) || worker !== activeWorker) return
      worker = null
      activeWorker.terminate()
      onUpdate({ type: 'error', error })
    }

    activeWorker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (!isCurrent(id) || worker !== activeWorker) return
      worker = null
      activeWorker.terminate()
      if (message.data.error) {
        onUpdate({ type: 'error', error: message.data.error })
      } else {
        onUpdate({
          type: 'loaded',
          name: file.name,
          file,
          events: message.data.events ?? [],
          warning: message.data.warning ?? '',
        })
      }
    }
    activeWorker.onerror = (event) => fail(event.message || 'Unable to parse recording')
    activeWorker.postMessage(input)
  }

  const loadInitial = async (development: boolean) => {
    const id = begin()
    try {
      const [text, metadata] = await Promise.all([
        fetch('/recording.jsonl').then((response) => {
          if (!response.ok) throw new Error('Unable to load recording')
          if (development && response.headers.get('content-type')?.includes('text/html')) return null
          return response.text()
        }),
        fetch('/recording-metadata.json').then(async (response) => {
          if (!response.ok) return null
          return response.json() as Promise<{ name?: unknown }>
        }).catch(() => null),
      ])
      if (!isCurrent(id)) return
      if (text === null) {
        onUpdate({ type: 'empty' })
        return
      }
      const name = typeof metadata?.name === 'string' ? metadata.name : 'recording.jsonl'
      const file = new File([text], name, { type: 'application/x-ndjson' })
      startWorker(id, file, { text })
    } catch (error) {
      if (!isCurrent(id)) return
      onUpdate(development ? { type: 'empty' } : { type: 'error', error: String(error) })
    }
  }

  const loadFile = (file: File) => {
    const id = begin()
    startWorker(id, file, file)
  }

  const dispose = () => {
    requestId += 1
    worker?.terminate()
    worker = null
  }

  return { loadInitial, loadFile, dispose }
}
