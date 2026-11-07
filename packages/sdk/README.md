# Event Tape Recorder SDK

Attach the recorder at a listener, middleware, or transport hook you own. Filter secrets before recording; the SDK does not interpret protocols, install listeners, or normalize identifiers.

```ts
import { createRecorder } from '@event-tape/sdk'

const recorder = await createRecorder({ file: './recordings/session.jsonl' })
myListener.on('message', (message) => {
  recorder.record({ source: 'my-listener', direction: 'incoming', payload: message })
})
await recorder.close()
```

`record()` snapshots its JSON payload synchronously and queues an event; await `close()` to finish writing. Playback controls will be delivered in the playback ticket; this viewer ticket supports timeline and raw event inspection only.
