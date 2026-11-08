import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'

const OVERVIEW_WIDTH = 800
const OVERVIEW_HEIGHT = 36

type TimelineOverviewProps = {
  events: RecordingEnvelope[]
  durationMs: number
  playheadMs: number
  range: [number, number] | null
  onSetRange: (start: number, end: number) => void
  onSeek: (positionMs: number) => void
  onKeyboardSeek: () => void
}

export function TimelineOverview({
  events,
  durationMs,
  playheadMs,
  range,
  onSetRange,
  onSeek,
  onKeyboardSeek,
}: TimelineOverviewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ pointerId: number; x: number; start: number } | null>(null)
  const [preview, setPreview] = useState<[number, number] | null>(null)
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
    const highlighted = preview ?? range
    if (highlighted && durationMs > 0) {
      context.fillStyle = getComputedStyle(canvas.current!).color
      context.globalAlpha = 0.15
      const start = Math.min(...highlighted) / durationMs * OVERVIEW_WIDTH
      const end = Math.max(...highlighted) / durationMs * OVERVIEW_WIDTH
      context.fillRect(start, 0, end - start, OVERVIEW_HEIGHT)
      context.globalAlpha = 1
    }
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
  }, [buckets, durationMs, playheadMs, preview, range])

  return (
    <button
      type="button"
      aria-label="Timeline overview: drag to select a playback range, or activate to seek with the keyboard"
      disabled={durationMs <= 0}
      className="bg-muted text-primary mb-2 block w-full touch-none cursor-crosshair overflow-hidden rounded-md border"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const start = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * durationMs
        drag.current = { pointerId: event.pointerId, x: event.clientX, start }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const end = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * durationMs
        if (Math.abs(event.clientX - drag.current.x) > 4) setPreview([drag.current.start, end])
        else setPreview(null)
      }}
      onPointerUp={(event) => {
        const active = drag.current
        if (!active || active.pointerId !== event.pointerId) return
        const bounds = event.currentTarget.getBoundingClientRect()
        const end = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * durationMs
        drag.current = null
        setPreview(null)
        if (Math.abs(event.clientX - active.x) > 4) onSetRange(active.start, end)
        else onSeek(end)
      }}
      onPointerCancel={() => {
        drag.current = null
        setPreview(null)
      }}
      onClick={(event) => {
        if (event.detail === 0) onKeyboardSeek()
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
