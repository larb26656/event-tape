import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { EventDetailsPanel } from './components/EventDetailsPanel'
import { RecordingHeader } from './components/RecordingHeader'
import { TimelinePanel } from './components/TimelinePanel'
import { createPlaybackStore } from './playback'
import type { RecordingEnvelope } from '@event-tape/recording-format'

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
  const canSeek = useStore(playback, (state) => state.canSeek)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const workerRef = useRef<Worker | null>(null)

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
        setWarning(message.data.warning ?? '')
      }
      setLoading(false)
      worker.terminate()
    }
    fetch('/recording.jsonl')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load recording')
        return response.text()
      })
      .then((text) => {
        if (workerRef.current === worker) worker.postMessage({ text })
      })
      .catch((reason: unknown) => {
        if (workerRef.current !== worker) return
        workerRef.current = null
        setError(String(reason))
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
        setWarning(message.data.warning ?? '')
      }
      setLoading(false)
      worker.terminate()
    }
    worker.postMessage(file)
  }
  const event = playback.getState().currentEvent()

  return (
    <main className="bg-background text-foreground min-h-svh p-6 md:p-10">
      <RecordingHeader onChooseFile={chooseFile} />
      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <TimelinePanel
          events={events}
          playheadMs={playheadMs}
          playing={playing}
          speed={speed}
          selected={selected}
          durationMs={durationMs}
          canSeek={canSeek}
          error={error}
          warning={warning}
          loading={loading}
          onToggle={() => playback.getState().toggle()}
          onSetSpeed={(value) => playback.getState().setSpeed(value)}
          onSeek={(value) => playback.getState().seek(value)}
          onSelectEvent={(index) => playback.getState().selectEvent(index)}
        />
        <EventDetailsPanel event={event} />
      </section>
    </main>
  )
}
