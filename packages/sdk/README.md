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

The queued data is limited to 16 MiB by default. Set `maxBufferedBytes` to change this limit; an event that would exceed it is rejected synchronously and previously accepted events remain queued. Serialization failures are also synchronous. Asynchronous write failures are passed to the optional `onError(error)` callback, stop subsequent records, and are still reported by `close()`.

Always await `close()` before considering a recording complete. Write failures may surface only while queued writes drain during close. A process crash can leave a truncated final JSONL line, and the SDK does not guarantee preservation across power loss or other abrupt system failure.
