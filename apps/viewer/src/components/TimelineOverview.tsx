import { useEffect, useMemo, useRef } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'

const OVERVIEW_WIDTH = 800
const OVERVIEW_HEIGHT = 36

type TimelineOverviewProps = {
  events: RecordingEnvelope[]
  durationMs: number
  playheadMs: number
  onSeek: (positionMs: number) => void
}

export function TimelineOverview({
  events,
  durationMs,
  playheadMs,
  onSeek,
}: TimelineOverviewProps) {
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
    <button
      type="button"
      aria-label="Seek on timeline"
      disabled={durationMs <= 0}
      className="bg-muted text-primary mb-3 block w-full overflow-hidden rounded-md border"
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        onSeek(((event.clientX - bounds.left) / bounds.width) * durationMs)
      }}
    >
      <canvas
        ref={canvas}
        aria-label={`${events.length} events summarized across the recording`}
        className="block h-9 w-full"
        height={OVERVIEW_HEIGHT}
        role="img"
        width={OVERVIEW_WIDTH}
      />
    </button>
  )
}
