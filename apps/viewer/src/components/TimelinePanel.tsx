import { useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
    <div className="bg-card min-w-0 border-t px-4 py-2.5 max-[700px]:p-2">
      <h2 className="hidden">
        Timeline{' '}
        <span className="text-muted-foreground text-sm">
          ({events.length} events)
        </span>
      </h2>
      {warning && (
        <Alert role="status" className="mb-4">
          <AlertDescription>Recording recovery warning: {warning}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading && (
        <p role="status" className="text-muted-foreground">
          Loading recording…
        </p>
      )}
      {!error && !loading && events.length === 0 && (
        <p className="text-muted-foreground">No events in this recording.</p>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TimelineOverview
            events={events}
            durationMs={durationMs}
            playheadMs={playheadMs}
            range={range}
            onSetRange={(start, end) => { setMark(null); onSetRange(start, end) }}
            onSeek={onSeek}
            onKeyboardSeek={() => positionControl.current?.focus()}
          />
        </div>
        {range && <Button type="button" variant="ghost" size="sm" onClick={() => { setMark(null); onClearRange() }}><X />Clear range</Button>}
      </div>
      <p className="hidden">Drag to select an inclusive playback range; click to seek.</p>
      <div className="grid grid-cols-[auto_minmax(80px,1fr)_auto_auto] items-center gap-4 max-[700px]:grid-cols-[1fr_auto] max-[700px]:gap-2">
        <div className="col-start-4 row-start-1 flex items-center justify-between gap-2 max-[700px]:col-span-full max-[700px]:col-start-1 max-[700px]:row-start-3">
          <span className="hidden">Playback</span>
          <div className="text-muted-foreground flex items-center gap-1 text-xs">
            <label htmlFor="playback-speed">Speed</label>
            <NativeSelect id="playback-speed" aria-label="Playback speed" value={speed} disabled={!canSeek} onChange={(event) => onSetSpeed(Number(event.target.value) as TimelinePanelProps['speed'])}>
              {([0.25, 0.5, 1, 2, 4] as const).map((value) => <NativeSelectOption key={value} value={value}>{value}×</NativeSelectOption>)}
            </NativeSelect>
          </div>
        </div>
        <div className="col-start-1 row-start-1 flex items-center justify-center gap-3 max-[700px]:row-start-2 max-[700px]:justify-start">
          <Button type="button" variant="ghost" size="icon" aria-label="Go to range start" disabled={!canSeek} onClick={() => onSeek(range?.[0] ?? 0)}><SkipBack /></Button>
          <Button type="button" size="icon" aria-label={playing ? 'Pause' : 'Play'} disabled={!canSeek || (range !== null && range[0] === range[1])} onClick={onToggle}>{playing ? <Pause /> : <Play />}</Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Go to range end" disabled={!canSeek} onClick={() => onSeek(range?.[1] ?? durationMs)}><SkipForward /></Button>
        </div>
        <input
          ref={positionControl}
          aria-label="Playback position"
          aria-describedby="range-keyboard-help"
          className="col-start-2 row-start-1 w-full accent-primary max-[700px]:col-span-full max-[700px]:col-start-1 max-[700px]:row-start-1"
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
        <div className="text-muted-foreground col-start-3 row-start-1 whitespace-nowrap text-center font-mono text-xs tabular-nums max-[700px]:col-start-2 max-[700px]:row-start-2">
          {(playheadMs / 1000).toFixed(2)} / {(durationMs / 1000).toFixed(2)} s
        </div>
      </div>
      <p id="range-keyboard-help" className="sr-only">On the playback position, press I to mark a range start, then O to mark its end. Clear the range first to select outside it.</p>
      <p role="status" className="text-muted-foreground text-xs">{rangeStart !== null ? `Range start marked at ${(rangeStart / 1000).toFixed(2)} s. Move the playhead and press O.` : ''}</p>
    </div>
  )
}
