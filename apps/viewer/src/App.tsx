import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { createPlaybackStore } from './playback'
import type { RecordingEnvelope } from '@event-tape/recording-format'

type WorkerResult = { events?: RecordingEnvelope[]; error?: string }

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
  const [loading, setLoading] = useState(true)
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
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (message.data.error) setError(message.data.error)
      else playback.getState().setEvents(message.data.events ?? [])
      setLoading(false)
    }
    fetch('/recording.jsonl')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load recording')
        return response.text()
      })
      .then((text) => worker.postMessage({ text }))
      .catch((reason: unknown) => {
        setError(String(reason))
        setLoading(false)
      })
    return () => worker.terminate()
  }, [playback])
  const chooseFile = (file?: File) => {
    if (!file) return
    setError('')
    setLoading(true)
    playback.getState().setEvents([])
    const worker = new Worker(
      new URL('./recording.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (message: MessageEvent<WorkerResult>) => {
      if (message.data.error) setError(message.data.error)
      else playback.getState().setEvents(message.data.events ?? [])
      setLoading(false)
      worker.terminate()
    }
    worker.postMessage(file)
  }
  const event = playback.getState().currentEvent()
  return (
    <main className="bg-background text-foreground min-h-svh p-6 md:p-10">
      <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
        <div>
          <p className="text-muted-foreground font-mono text-sm">EVENT TAPE</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Recording viewer
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={() => document.getElementById('recording-file')?.click()}
        >
          Open recording
        </Button>
        <input
          id="recording-file"
          className="hidden"
          type="file"
          accept=".jsonl,application/x-ndjson"
          onChange={(e) => chooseFile(e.target.files?.[0])}
        />
      </header>
      <section className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-medium">
            Timeline{' '}
            <span className="text-muted-foreground text-sm">
              ({events.length} events)
            </span>
          </h2>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {loading && (
            <p role="status" className="text-muted-foreground">
              Loading recording…
            </p>
          )}
          {!error && !loading && events.length === 0 && (
            <p className="text-muted-foreground">
              No events in this recording.
            </p>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={!canSeek} onClick={() => playback.getState().toggle()}>
              {playing ? 'Pause' : 'Play'}
            </Button>
            {[1, 2, 4].map((value) => (
              <Button key={value} variant={speed === value ? 'default' : 'outline'} onClick={() => playback.getState().setSpeed(value as 1 | 2 | 4)} aria-pressed={speed === value}>
                {value}×
              </Button>
            ))}
            <span className="text-muted-foreground font-mono text-xs">
              {(playheadMs / 1000).toFixed(2)} / {(durationMs / 1000).toFixed(2)} s
            </span>
          </div>
          <input aria-label="Playback position" className="mb-4 w-full accent-primary" type="range" min={0} max={durationMs} step={1} value={playheadMs} disabled={!canSeek} onChange={(e) => playback.getState().seek(Number(e.target.value))} />
          <ol className="max-h-[65vh] space-y-2 overflow-auto">
            {events.map((item, index) => (
              <li key={`${item.seq}-${index}`}>
                <button
                  className={`hover:bg-accent w-full rounded-lg border p-3 text-left transition-colors ${selected === index ? 'bg-accent' : ''}`}
                  onClick={() => playback.getState().selectEvent(index)}
                >
                  <span className="text-muted-foreground font-mono text-xs">
                    #{item.seq} · {item.elapsedMs.toFixed(2)} ms
                  </span>
                  <p className="mt-1 font-medium">
                    {item.source}
                    {item.direction ? ` · ${item.direction}` : ''}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {JSON.stringify(item.payload)}
                  </p>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-medium">Raw JSON</h2>
          {event ? (
            <pre className="bg-muted max-h-[65vh] overflow-auto rounded-lg p-4 text-xs leading-relaxed">
              {JSON.stringify(event, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">
              Select an event to inspect its envelope and payload.
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
