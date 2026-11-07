# Event Tape Recorder SDK

Install `@event-tape/sdk` in a Node.js 22+ ESM project. The SDK records JSONL from an application-owned listener; it does not install listeners, interpret protocols, normalize identifiers, or redact secrets. Filter sensitive data before calling `record()`.

```sh
npm install @event-tape/sdk
```

The SDK is ESM-only, includes TypeScript declarations, and has no runtime dependencies.

```ts
import { createRecorder } from '@event-tape/sdk'

const recorder = createRecorder({
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

`createRecorder()` creates the parent directories and opens the destination synchronously. An existing file or other open failure throws immediately. `source` is required; `direction` is any string or may be omitted. `payload` must be losslessly JSON-serializable. Snapshotting is synchronous when `record()` is called, so later mutations do not affect the recording. Values JSON would omit or rewrite are rejected. Do not record secrets unless filtered by the caller.

`close()` stops new records and waits for queued writes and the file handle to close. Await it before considering a recording complete. The SDK never overwrites or appends. Serialization errors and queue-limit errors throw synchronously from `record()`.

The queued data is limited to 16 MiB by default. Set `maxBufferedBytes` to change this limit; an event that would exceed it is rejected synchronously and previously accepted events remain queued. Asynchronous write failures are passed to optional `onError(error)`, stop subsequent records, and are still reported by `close()`. Always catch a rejected `close()`; without `onError`, it is how to observe asynchronous write failure. A process crash can leave a truncated final JSONL line, and the SDK does not guarantee preservation across power loss or other abrupt system failure.

The Viewer is a separate CLI package. Install its packed artifact independently and run `event-tape view ./recordings/session.jsonl`; it serves local static assets on loopback and opens the browser. It does not upload recordings. Playback is view-only and does not emit events to the original application. Viewer accepts this tool's JSONL schema only; it loads recordings in memory, so available browser memory is a practical constraint. The 50 MB and 100,000-event figures are tested targets, not hard limits or performance guarantees beyond those sizes.
