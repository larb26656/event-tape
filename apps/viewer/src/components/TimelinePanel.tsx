import { useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
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
  const [mark, setMark] = useState<{ events: RecordingEnvelope[]; start: number } | null>(null)
  const rangeStart = mark?.events === events ? mark.start : null
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
        onSetRange={(start, end) => { setMark(null); onSetRange(start, end) }}
        onSeek={onSeek}
        onKeyboardSeek={() => positionControl.current?.focus()}
      />
      <p className="text-muted-foreground mb-3 text-sm">Drag to select an inclusive playback range; click to seek.</p>
      <div className="mb-5 rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Playback</span>
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            Speed
            <select aria-label="Playback speed" value={speed} disabled={!canSeek} onChange={(event) => onSetSpeed(Number(event.target.value) as TimelinePanelProps['speed'])} className="text-foreground bg-background rounded-md border px-2 py-1.5 text-sm">
              {([0.25, 0.5, 1, 2, 4] as const).map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="ghost" size="icon" aria-label="Go to range start" disabled={!canSeek} onClick={() => onSeek(range?.[0] ?? 0)}><SkipBack /></Button>
          <Button type="button" size="icon" aria-label={playing ? 'Pause' : 'Play'} disabled={!canSeek || (range !== null && range[0] === range[1])} onClick={onToggle}>{playing ? <Pause /> : <Play />}</Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Go to range end" disabled={!canSeek} onClick={() => onSeek(range?.[1] ?? durationMs)}><SkipForward /></Button>
        </div>
        <input
          ref={positionControl}
          aria-label="Playback position"
          aria-describedby="range-keyboard-help"
          className="mt-4 w-full accent-primary"
          type="range"
          min={range?.[0] ?? 0}
          max={range?.[1] ?? durationMs}
          step="any"
          value={playheadMs}
          disabled={!canSeek}
          onChange={(event) => onSeek(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key.toLowerCase() === 'i') {
              setMark({ events, start: playheadMs })
            } else if (event.key.toLowerCase() === 'o' && rangeStart !== null) {
              onSetRange(rangeStart, playheadMs)
              setMark(null)
            }
          }}
        />
        <div className="mt-1 text-center text-muted-foreground font-mono text-xs tabular-nums">
          {(playheadMs / 1000).toFixed(2)} / {(durationMs / 1000).toFixed(2)} s
        </div>
      </div>
      <p id="range-keyboard-help" className="text-muted-foreground mb-3 text-xs">On the playback position, press I to mark a range start, then O to mark its end. Clear the range first to select outside it.</p>
      <p role="status" className="text-muted-foreground text-xs">{rangeStart !== null ? `Range start marked at ${(rangeStart / 1000).toFixed(2)} s. Move the playhead and press O.` : ''}</p>
      {range && <Button type="button" variant="outline" onClick={() => { setMark(null); onClearRange() }}>Clear range</Button>}
    </div>
  )
}
