import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { Input } from './ui/input'
import { EventCard } from './EventCard'

const EVENT_ROW_HEIGHT = 104

type EventListProps = {
  events: RecordingEnvelope[]
  range: [number, number] | null
  selected: number
  playheadMs: number
  loading: boolean
  error: string
  onSelect: (index: number) => void
}

export function EventList({ events, range, selected, playheadMs, loading, error, onSelect }: EventListProps) {
  const listParent = useRef<HTMLDivElement>(null)
  const focusResult = useRef<number | null>(null)
  const [query, setQuery] = useState('')
  const ordered = useMemo(() => events.map((_, index) => index).sort((a, b) =>
    events[a].elapsedMs - events[b].elapsedMs || events[a].seq - events[b].seq || a - b,
  ), [events])
  const results = useMemo(() => {
    const needle = query.toLowerCase()
    return ordered.filter((index) => {
      const event = events[index]
      return (!range || (event.elapsedMs >= range[0] && event.elapsedMs <= range[1]))
        && (!needle || JSON.stringify(event).toLowerCase().includes(needle))
    })
  }, [events, ordered, query, range])
  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => EVENT_ROW_HEIGHT,
    overscan: 8,
  })

  const selectedResult = results.indexOf(selected)
  useEffect(() => {
    if (selectedResult >= 0) {
      virtualizer.scrollToIndex(selectedResult, { align: 'auto' })
    }
  }, [selectedResult, playheadMs, virtualizer])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label htmlFor="event-search" className="mb-2 block text-sm font-medium">
        Search events
      </label>
      <Input
        id="event-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search event JSON"
        className="mb-4"
      />
      {!loading && !error && events.length === 0 ? (
        <p className="text-muted-foreground text-sm">No events in this recording.</p>
      ) : events.length > 0 && results.length === 0 ? (
        <p className="text-muted-foreground text-sm">{query ? 'No events match your search in this range.' : 'No events in this range.'}</p>
      ) : null}
      <div ref={listParent} aria-label="Recording events" className="min-h-0 flex-1 overflow-auto">
      <ol
        aria-label="Recording events"
        className="relative list-none p-0"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const originalIndex = results[row.index]
          const item = events[originalIndex]
          if (!item) return null
          return (
            <li
              key={originalIndex}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-2"
              style={{
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
            >
              <EventCard
                item={item}
                selected={selected === originalIndex}
                ref={(button) => {
                  if (button && focusResult.current === originalIndex) {
                    focusResult.current = null
                    button.focus({ preventScroll: true })
                  }
                }}
                onClick={() => onSelect(originalIndex)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  const next = row.index + (event.key === 'ArrowDown' ? 1 : -1)
                  if (next < 0 || next >= results.length) return
                  focusResult.current = results[next]
                  virtualizer.scrollToIndex(next, { align: 'auto' })
                  onSelect(results[next])
                }}
              />
            </li>
          )
        })}
      </ol>
    </div>
    </div>
  )
}
