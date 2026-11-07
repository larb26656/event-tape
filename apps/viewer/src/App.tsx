import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { createPlaybackStore } from './playback'
import type { RecordingEnvelope } from '@event-tape/recording-format'

type WorkerResult = {
  events?: RecordingEnvelope[]
  warning?: string
  error?: string
}

const EVENT_ROW_HEIGHT = 104
const OVERVIEW_WIDTH = 800
const OVERVIEW_HEIGHT = 36

function TimelineOverview({
  events,
  durationMs,
  playheadMs,
}: {
  events: RecordingEnvelope[]
  durationMs: number
  playheadMs: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const buckets = useMemo(() => {
    const counts = new Uint32Array(OVERVIEW_WIDTH)
    if (durationMs > 0) {
      for (const item of events) {
        const column = Math.min(
          OVERVIEW_WIDTH - 1,
          Math.floor((item.elapsedMs / durationMs) * OVERVIEW_WIDTH),
        )
        counts[column] += 1
      }
    }
    return counts
  }, [durationMs, events])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, OVERVIEW_WIDTH, OVERVIEW_HEIGHT)
    let maxCount = 1
    for (const count of buckets) maxCount = Math.max(maxCount, count)
    context.fillStyle = canvas.current
      ? getComputedStyle(canvas.current).color
      : 'black'
    buckets.forEach((count, column) => {
      if (count === 0) return
      const height = Math.max(2, (count / maxCount) * (OVERVIEW_HEIGHT - 4))
      context.globalAlpha = 0.65
      context.fillRect(column, OVERVIEW_HEIGHT - height, 1, height)
    })
    context.globalAlpha = 1
    if (durationMs > 0) {
      const x = (playheadMs / durationMs) * OVERVIEW_WIDTH
      context.fillRect(Math.min(OVERVIEW_WIDTH - 1, x), 0, 1, OVERVIEW_HEIGHT)
    }
  }, [buckets, durationMs, playheadMs])

  return (
    <div className="bg-muted text-primary mb-3 overflow-hidden rounded-md border">
      <canvas
        ref={canvas}
        aria-label={`${events.length} events summarized across the recording`}
        className="block h-9 w-full"
        height={OVERVIEW_HEIGHT}
        role="img"
        width={OVERVIEW_WIDTH}
      />
    </div>
  )
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
  const listParent = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => EVENT_ROW_HEIGHT,
    overscan: 8,
  })

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
          {warning && (
            <div
              role="status"
              className="bg-muted text-muted-foreground mb-4 rounded-lg border p-3 text-sm"
            >
              Recording recovery warning: {warning}
            </div>
          )}
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
          <TimelineOverview
            events={events}
            durationMs={durationMs}
            playheadMs={playheadMs}
          />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={!canSeek}
              onClick={() => playback.getState().toggle()}
            >
              {playing ? 'Pause' : 'Play'}
            </Button>
            {[1, 2, 4].map((value) => (
              <Button
                key={value}
                variant={speed === value ? 'default' : 'outline'}
                onClick={() =>
                  playback.getState().setSpeed(value as 1 | 2 | 4)
                }
                aria-pressed={speed === value}
              >
                {value}×
              </Button>
            ))}
            <span className="text-muted-foreground font-mono text-xs">
              {(playheadMs / 1000).toFixed(2)} / {(durationMs / 1000).toFixed(2)}
              {' '}s
            </span>
          </div>
          <input
            aria-label="Playback position"
            className="mb-4 w-full accent-primary"
            type="range"
            min={0}
            max={durationMs}
            step={1}
            value={playheadMs}
            disabled={!canSeek}
            onChange={(e) => playback.getState().seek(Number(e.target.value))}
          />
          <div
            ref={listParent}
            aria-label="Recording events"
            className="max-h-[65vh] overflow-auto"
          >
            <ol
              aria-label="Recording events"
              className="relative list-none p-0"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const item = events[row.index]
                if (!item) return null
                return (
                  <li
                    key={`${item.seq}-${row.index}`}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <button
                      className={`hover:bg-accent h-full w-full rounded-lg border p-3 text-left transition-colors ${selected === row.index ? 'bg-accent' : ''}`}
                      onClick={() => playback.getState().selectEvent(row.index)}
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
                )
              })}
            </ol>
          </div>
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
