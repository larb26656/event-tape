import { memo } from 'react'
import { usePlaybackStore } from '../stores/playback'
import { JsonViewer } from './JsonViewer'

export const EventDetailsPanel = memo(function EventDetailsPanel() {
  const event = usePlaybackStore((state) => state.currentEvent())
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
