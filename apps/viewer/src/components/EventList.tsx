import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RecordingEnvelope } from '@event-tape/recording-format'

const EVENT_ROW_HEIGHT = 104

type EventListProps = {
  events: RecordingEnvelope[]
  selected: number
  onSelect: (index: number) => void
}

export function EventList({ events, selected, onSelect }: EventListProps) {
  const listParent = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => EVENT_ROW_HEIGHT,
    overscan: 8,
  })

  useEffect(() => {
    if (selected >= 0 && selected < events.length) {
      virtualizer.scrollToIndex(selected, { align: 'auto' })
    }
  }, [events.length, selected, virtualizer])

  return (
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
                aria-pressed={selected === row.index}
                className={`hover:bg-accent h-full w-full rounded-lg border p-3 text-left transition-colors ${selected === row.index ? 'bg-accent' : ''}`}
                onClick={() => onSelect(row.index)}
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
  )
}
