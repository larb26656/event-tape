import type { RecordingEnvelope } from '@event-tape/recording-format'

type EventDetailsPanelProps = {
  event: RecordingEnvelope | undefined
}

export function EventDetailsPanel({ event }: EventDetailsPanelProps) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <h2 className="mb-4 text-lg font-medium">Raw JSON</h2>
      {event ? (
        <pre className="bg-muted max-h-[65vh] overflow-auto rounded-lg p-4 text-xs leading-relaxed">
          {JSON.stringify(event, null, 2)}
        </pre>
      ) : (
        <p className="text-muted-foreground">
          Select an event to inspect its envelope and payload.
        </p>
      )}
    </div>
  )
}
