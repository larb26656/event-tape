import { Highlight } from 'prism-react-renderer'
import { memo, useMemo } from 'react'
import type { RecordingEnvelope } from '@event-tape/recording-format'

type EventDetailsPanelProps = {
  event: RecordingEnvelope | undefined
}

export const EventDetailsPanel = memo(function EventDetailsPanel({ event }: EventDetailsPanelProps) {
  const json = useMemo(() => event ? JSON.stringify(event, null, 2) : '', [event])

  return (
    <div className="bg-card min-w-0 rounded-xl border p-5">
      <h2 className="mb-4 text-lg font-medium">Raw JSON</h2>
      {event ? (
        <Highlight code={json} language="json" theme={{ plain: {}, styles: [] }}>
          {({ tokens, getTokenProps }) => (
            <pre className="json-highlight bg-muted max-h-[65vh] overflow-auto rounded-lg p-4 text-xs leading-relaxed">
              {tokens.map((line, lineIndex) => (
                <span key={lineIndex}>
                  {line.map((token, tokenIndex) => (
                    <span key={tokenIndex} {...getTokenProps({ token })} />
                  ))}
                  {lineIndex < tokens.length - 1 ? '\n' : null}
                </span>
              ))}
            </pre>
          )}
        </Highlight>
      ) : (
        <p className="text-muted-foreground">
          Select an event to inspect its envelope and payload.
        </p>
      )}
    </div>
  )
})
