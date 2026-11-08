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
  await recorder.close()
}
```

`createRecorder()` requires exactly one destination: `file` or an injected `writer`. File configuration creates parent directories and opens the destination synchronously; an existing file or other open failure throws immediately. A custom Writer is selected at construction and receives structured v1 Recording events through `write(event)`, not JSONL strings; it chooses its own format and destination. Both `write()` and `close()` may be synchronous or return a Promise. The Recorder owns and closes the Writer, and each Writer instance must belong to one Recorder only. `source` is required; `direction` is any string or may be omitted. `payload` must be losslessly JSON-serializable. Snapshotting is synchronous when `record()` is called, so later mutations do not affect the recording. Values JSON would omit or rewrite are rejected. Do not record secrets unless filtered by the caller.

`close()` immediately stops new records, waits for queued writes, and closes the Writer; repeated calls return the same promise. Await it before considering a recording complete. Serialization errors and queue-limit errors throw synchronously from `record()`.

The public `Writer` interface accepts structured events and exposes `close()`; either method may be synchronous or return a Promise. `createFileWriter({ file })` provides the filesystem adapter: it creates parent directories, exclusively creates the destination, encodes each event as JSONL, completes partial writes, and closes the file descriptor. Its file-opening errors are thrown synchronously and its write failures reject. The normal `createRecorder({ file })` API uses this File Writer automatically. Recorder owns payload snapshots, metadata, ordered dispatch, queue-byte accounting, and shutdown orchestration.

The pending queue is limited to 16 MiB by default. Set `maxBufferedBytes` to change this limit. Accounting is the UTF-8 byte size of each canonical v1 JSONL event including its newline, regardless of a custom Writer's output format; it excludes any buffers internal to the Writer. An event that would exceed the limit is rejected synchronously without discarding previously accepted events. Completed or failed/skipped writes release accounting. Writes are serialized in acceptance order. A write failure is reported to optional `onError(error)`, prevents later queued writes and records, and remains authoritative if the callback or Writer close also fails. `close()` still closes the Writer and rejects with the first write failure, or with a shutdown failure if writes succeeded. A successful close does not guarantee preservation across crashes or power loss.

The Viewer is a separate CLI package. Install its packed artifact independently and run `event-tape view ./recordings/session.jsonl`; it serves local static assets on loopback and opens the browser. It does not upload recordings. Playback is view-only and does not emit events to the original application. Viewer accepts this tool's JSONL schema only; it loads recordings in memory, so available browser memory is a practical constraint. The 50 MB and 100,000-event figures are tested targets, not hard limits or performance guarantees beyond those sizes.
