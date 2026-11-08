import type { ComponentProps } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { cn } from 'cn'

type EventCardProps = {
  item: RecordingEnvelope
  selected: boolean
} & Pick<ComponentProps<'button'>, 'ref' | 'onClick' | 'onKeyDown'>

export function EventCard({ item, selected, ref, onClick, onKeyDown }: EventCardProps) {
  return (
    <button
      ref={ref}
      aria-pressed={selected}
      className={cn('focus-visible:outline-ring h-full w-full cursor-pointer border-b p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px]', selected ? 'bg-muted' : 'hover:bg-muted/60')}
      onClick={onClick}
      onKeyDown={onKeyDown}
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
  )
}
