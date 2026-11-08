import { memo } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import { JsonViewer } from './JsonViewer'

type EventDetailsPanelProps = {
  event: RecordingEnvelope | undefined
}

export const EventDetailsPanel = memo(function EventDetailsPanel({ event }: EventDetailsPanelProps) {
  return (
    <div className="bg-card min-w-0 rounded-xl border p-5">
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
