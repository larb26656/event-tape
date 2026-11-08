import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { TimelineOverview } from './TimelineOverview'

type TimelinePanelProps = {
  events: RecordingEnvelope[]
  playheadMs: number
  playing: boolean
  speed: 0.25 | 0.5 | 1 | 2 | 4
  durationMs: number
  range: [number, number] | null
  canSeek: boolean
  error: string
  warning: string
  loading: boolean
  onToggle: () => void
  onSetSpeed: (speed: 0.25 | 0.5 | 1 | 2 | 4) => void
  onSeek: (positionMs: number) => void
  onSetRange: (start: number, end: number) => void
  onClearRange: () => void
}

export function TimelinePanel({
  events,
  playheadMs,
  playing,
  speed,
  durationMs,
  range,
  canSeek,
  error,
  warning,
  loading,
  onToggle,
  onSetSpeed,
  onSeek,
  onSetRange,
  onClearRange,
}: TimelinePanelProps) {
  const positionControl = useRef<HTMLInputElement>(null)
  return (
    <div className="bg-card min-w-0 rounded-xl border p-5">
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
        <p className="text-muted-foreground">No events in this recording.</p>
      )}
      <TimelineOverview
        events={events}
        durationMs={durationMs}
        playheadMs={playheadMs}
        range={range}
        onSetRange={onSetRange}
        onSeek={onSeek}
        onKeyboardSeek={() => positionControl.current?.focus()}
      />
      <p className="text-muted-foreground mb-3 text-sm">Drag to select an inclusive playback range; click to seek.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!canSeek || (range !== null && range[0] === range[1])} onClick={onToggle}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        {([0.25, 0.5, 1, 2, 4] as const).map((value) => (
          <Button
            key={value}
            disabled={!canSeek}
            onClick={() => onSetSpeed(value)}
            aria-pressed={speed === value}
          >
            {value}×
          </Button>
        ))}
        <span className="text-muted-foreground font-mono text-xs">
          {(playheadMs / 1000).toFixed(2)} / {(durationMs / 1000).toFixed(2)}{' '}
          s
        </span>
      </div>
      <input
        ref={positionControl}
        aria-label="Playback position"
        className="mb-4 w-full accent-primary"
        type="range"
        min={range?.[0] ?? 0}
        max={range?.[1] ?? durationMs}
        step="any"
        value={playheadMs}
        disabled={!canSeek || (range !== null && range[0] === range[1])}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <form
        key={`${durationMs}:${range?.[0] ?? 0}:${range?.[1] ?? durationMs}`}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          onSetRange(Number(data.get('start')), Number(data.get('end')))
        }}
      >
        <label className="text-sm">
          Range start (ms)
          <input name="start" type="number" min={0} max={durationMs} step="any" required defaultValue={range?.[0] ?? 0} disabled={!canSeek} className="border-input bg-background mt-1 block w-32 rounded-md border px-2 py-1" />
        </label>
        <label className="text-sm">
          Range end (ms)
          <input name="end" type="number" min={0} max={durationMs} step="any" required defaultValue={range?.[1] ?? durationMs} disabled={!canSeek} className="border-input bg-background mt-1 block w-32 rounded-md border px-2 py-1" />
        </label>
        <Button type="submit" variant="outline" disabled={!canSeek}>Apply range</Button>
        <Button type="button" variant="outline" disabled={!range} onClick={onClearRange}>Clear range</Button>
      </form>
    </div>
  )
}
