# Event Tape Recorder SDK

Install `@event-tape/sdk` in a Node.js 22+ ESM project. The SDK records JSONL from an application-owned listener; it does not install listeners, interpret protocols, normalize identifiers, or redact secrets. Filter sensitive data before calling `record()`.

```sh
npm install @event-tape/sdk
```

```ts
import { createRecorder } from '@event-tape/sdk'

const recorder = await createRecorder({
  file: './recordings/session.jsonl',
  onError: (error) => console.error('Recording write failed', error),
})
const onMessage = (message: unknown) => {
  recorder.record({ source: 'my-listener', direction: 'incoming', payload: message })
}
myListener.on('message', onMessage)

try {
  await runApplication()
} finally {
  myListener.off('message', onMessage)
  // Required: drains accepted writes and reports asynchronous write errors.
  await recorder.close()
}
```

`record()` snapshots its JSON payload synchronously and queues an event. Serialization failures and buffer-limit violations throw synchronously; do not ignore them if a complete recording is required. Write errors are passed to `onError(error)` and reported again by `close()`. Always await `close()` before using the file. A process crash can leave a truncated final JSONL line; the SDK does not guarantee preservation across abrupt system failure.

The queued data is limited to 16 MiB by default. Set `maxBufferedBytes` to change this limit. An event that would exceed the limit is rejected synchronously while previously accepted events remain queued. The SDK is a Node.js API (it uses filesystem APIs), has no runtime package dependencies, and does not provide Replay or protocol adapters.
