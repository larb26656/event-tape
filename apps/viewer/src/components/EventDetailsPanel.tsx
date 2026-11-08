import { memo } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { JsonViewer } from './JsonViewer'

type EventDetailsPanelProps = {
  event: RecordingEnvelope | undefined
}

export const EventDetailsPanel = memo(function EventDetailsPanel({ event }: EventDetailsPanelProps) {
  return (
    <div className="bg-card flex h-full min-h-0 min-w-0 flex-col p-4">
      <h2 className="mb-4 text-lg font-medium">Raw JSON</h2>
      {event ? (
        <JsonViewer value={event} />
      ) : (
        <p className="text-muted-foreground">
          Select an event to inspect its envelope and payload.
        </p>
      )}
    </div>
  )
})
