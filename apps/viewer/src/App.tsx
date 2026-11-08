import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { EventDetailsPanel } from './components/EventDetailsPanel'
import { EmptyRecording } from './components/EmptyRecording'
import { EventList } from './components/EventList'
import { ViewerHeader } from './components/ViewerHeader'
import { TimelinePanel } from './components/TimelinePanel'
import { createPlaybackStore } from './playback'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import './viewer.css'

type WorkerResult = {
  events?: RecordingEnvelope[]
  warning?: string
  error?: string
}

export default function App() {
  const [playback] = useState(createPlaybackStore)
  const events = useStore(playback, (state) => state.events)
  const playheadMs = useStore(playback, (state) => state.playheadMs)
  const playing = useStore(playback, (state) => state.playing)
  const speed = useStore(playback, (state) => state.speed)
  const selected = useStore(playback, (state) => state.selectedIndex)
  const durationMs = useStore(playback, (state) => state.durationMs)
  const range = useStore(playback, (state) => state.range)
  const visibleCount = useMemo(() => range
    ? events.filter((event) => event.elapsedMs >= range[0] && event.elapsedMs <= range[1]).length
    : events.length, [events, range])
  const canSeek = useStore(playback, (state) => state.canSeek)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const workerRef = useRef<Worker | null>(null)
  const [currentName, setCurrentName] = useState('No file open')
  const [hasRecording, setHasRecording] = useState(false)
  const [recent, setRecent] = useState<File[]>([])

  useEffect(() => {
    if (!playing) return
    let previous = performance.now()
    let frame = 0
    const tick = (now: number) => {
      playback.getState().advance(now - previous)
      previous = now
      if (playback.getState().playing) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playback, playing])

  useEffect(() => {
    let recordingName = 'recording.jsonl'
    let initialFile: File | undefined
    const worker = new Worker(
      new URL('./recording.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (workerRef.current !== worker) return
      workerRef.current = null
      if (message.data.error) {
        setError(message.data.error)
        playback.getState().setEvents([])
        setWarning('')
      } else {
        playback.getState().setEvents(message.data.events ?? [])
        setHasRecording(true)
        setCurrentName(recordingName)
        if (initialFile) setRecent((previous) => [initialFile!, ...previous])
        setWarning(message.data.warning ?? '')
      }
      setLoading(false)
      worker.terminate()
    }
    Promise.all([
      fetch('/recording.jsonl').then((response) => {
        if (!response.ok) throw new Error('Unable to load recording')
        if (import.meta.env.DEV && response.headers.get('content-type')?.includes('text/html')) return null
        return response.text()
      }),
      fetch('/recording-metadata.json').then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ name?: unknown }>
      }).catch(() => null),
    ])
      .then(([text, metadata]) => {
        if (text === null) {
          if (workerRef.current === worker) {
            workerRef.current = null
            setLoading(false)
            worker.terminate()
          }
          return
        }
        if (typeof metadata?.name === 'string') recordingName = metadata.name
        initialFile = new File([text], recordingName, { type: 'application/x-ndjson' })
        if (workerRef.current === worker) worker.postMessage({ text })
      })
      .catch((reason: unknown) => {
        if (workerRef.current !== worker) return
        workerRef.current = null
        if (!import.meta.env.DEV) setError(String(reason))
        setLoading(false)
        worker.terminate()
      })
    return () => {
      if (workerRef.current === worker) workerRef.current = null
      worker.terminate()
    }
  }, [playback])

  const chooseFile = (file?: File) => {
    if (!file) return
    workerRef.current?.terminate()
    workerRef.current = null
    setError('')
    setWarning('')
    setLoading(true)
    setHasRecording(false)
    setCurrentName('No file open')
    playback.getState().setEvents([])
    const worker = new Worker(
      new URL('./recording.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (workerRef.current !== worker) return
      workerRef.current = null
      if (message.data.error) {
        setError(message.data.error)
        playback.getState().setEvents([])
        setWarning('')
      } else {
        playback.getState().setEvents(message.data.events ?? [])
        setHasRecording(true)
        setCurrentName(file.name)
        setRecent((previous) => [file, ...previous.filter((item) => !(item.name === file.name && item.size === file.size && item.lastModified === file.lastModified))])
        setWarning(message.data.warning ?? '')
      }
      setLoading(false)
      worker.terminate()
    }
    worker.postMessage(file)
  }
  const event = playback.getState().currentEvent()

  const openFile = () => document.getElementById('recording-file')?.click()

  return (
    <main className="viewer-shell">
      <ViewerHeader currentName={currentName} recent={recent} onOpen={openFile} onRecent={chooseFile} />
      <input id="recording-file" className="hidden" type="file" accept=".jsonl,application/x-ndjson" onChange={(change) => {
        chooseFile(change.target.files?.[0])
        change.target.value = ''
      }} />
      {!hasRecording && !loading && !error ? <EmptyRecording onOpen={openFile} /> : (
        <div className="viewer-content">
          <div className="viewer-workspace">
            <section aria-labelledby="recording-events-heading" className="viewer-events bg-card min-w-0 rounded-xl border p-5">
              <h2 id="recording-events-heading" className="mb-4 text-lg font-medium">
                Recording events <span className="text-muted-foreground text-sm">({visibleCount})</span>
              </h2>
              <EventList events={events} range={range} selected={selected} playheadMs={playheadMs} loading={loading} error={error} onSelect={(index) => playback.getState().selectEvent(index)} />
            </section>
            <div className="viewer-json"><EventDetailsPanel event={event} /></div>
          </div>
          <div className="viewer-player">
            <TimelinePanel
              events={events}
              playheadMs={playheadMs}
              playing={playing}
              speed={speed}
              durationMs={durationMs}
              range={range}
              canSeek={canSeek}
              error={error}
              warning={warning}
              loading={loading}
              onToggle={() => playback.getState().toggle()}
              onSetSpeed={(value) => playback.getState().setSpeed(value)}
              onSeek={(value) => playback.getState().seek(value)}
              onSetRange={(start, end) => playback.getState().setRange(start, end)}
              onClearRange={() => playback.getState().clearRange()}
            />
          </div>
        </div>
      )}
    </main>
  )
}
