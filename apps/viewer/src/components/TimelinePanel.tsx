import { Button } from '@/components/ui/button'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { TimelineOverview } from './TimelineOverview'

type TimelinePanelProps = {
  events: RecordingEnvelope[]
  playheadMs: number
  playing: boolean
  speed: 1 | 2 | 4
  durationMs: number
  canSeek: boolean
  error: string
  warning: string
  loading: boolean
  onToggle: () => void
  onSetSpeed: (speed: 1 | 2 | 4) => void
  onSeek: (positionMs: number) => void
}

export function TimelinePanel({
  events,
  playheadMs,
  playing,
  speed,
  durationMs,
  canSeek,
  error,
  warning,
  loading,
  onToggle,
  onSetSpeed,
  onSeek,
}: TimelinePanelProps) {
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
        onSeek={onSeek}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={!canSeek} onClick={onToggle}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        {[1, 2, 4].map((value) => (
          <Button
            key={value}
            disabled={!canSeek}
            onClick={() => onSetSpeed(value as 1 | 2 | 4)}
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
        aria-label="Playback position"
        className="mb-4 w-full accent-primary"
        type="range"
        min={0}
        max={durationMs}
        step="any"
        value={playheadMs}
        disabled={!canSeek}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </div>
  )
}
