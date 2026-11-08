# Event Tape Recorder SDK

Install `@event-tape/sdk` in a Node.js 22+ ESM project. The SDK records JSONL from an application-owned listener; it does not install listeners, interpret protocols, normalize identifiers, or redact secrets. Filter sensitive data before calling `record()`.

```sh
npm install @event-tape/sdk
```

For installation from a local checkout without publishing to a registry, see the [local packaging instructions](../../README.md#1-build-and-install).

The SDK is ESM-only, includes TypeScript declarations, and has no runtime dependencies.

```ts
import { createRecorder } from '@event-tape/sdk'

const recorder = createRecorder({
  file: './recordings/session.jsonl',
  onError: (error) => console.error('Recording write failed', error),
})
const onMessage = (message: unknown) => {
  recorder.record({
    source: 'my-listener',
    direction: 'incoming',
    payload: message,
  })
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

`close()` immediately stops new records, waits for accepted writes to settle, and closes the Writer; repeated calls return the same promise. Await it before considering a recording complete. Serialization errors and queue-limit errors throw synchronously from `record()`.

During synchronous input preparation, a nested `record()` call is rejected without consuming sequence or timing metadata; this per-call rejection does not poison the Recorder. Writer callbacks run after acceptance is committed and may call `record()` while the Recorder remains open. Neither `Writer.write()` nor `Writer.close()` may await `close()` on its owning Recorder: shutdown waits for the active Writer operation to settle, so doing so creates a circular wait.

The public `Writer` interface accepts structured events and exposes `close()`; either method may be synchronous or return a Promise. `createFileWriter({ file })` provides the filesystem adapter: it creates parent directories, exclusively creates the destination, encodes each event as JSONL, completes partial writes, and closes the file descriptor. Its file-opening errors are thrown synchronously and its write failures reject. The normal `createRecorder({ file })` API uses this File Writer automatically. Recorder owns validation, synchronous payload snapshots, envelope metadata, sequence/timing, and canonical byte-cost calculation. Internal WritePipeline owns FIFO dispatch, the single aggregate pending-byte ledger, fail-stop behavior, drain, and exactly-once Writer cleanup. Writer owns destination serialization, I/O, and any buffers it retains.

The pending-event budget is limited to 16 MiB by default. Set `maxBufferedBytes` to change this limit. Recorder measures each canonical v1 JSONL event in UTF-8 bytes including its newline, regardless of a custom Writer's output format; WritePipeline counts queued and in-flight charges and releases each exactly once when `write()` settles or when queued work is skipped after failure. This logical budget excludes temporary serialization allocations, Writer-owned buffers, and actual destination output size. An event exceeding the limit is rejected synchronously without discarding accepted work. A write failure is reported to optional `onError(error)` once, prevents later writes and records, and remains authoritative if the callback or Writer close also fails. `close()` still closes the Writer and rejects with the first write failure, or with the cleanup failure when cleanup alone fails (including an `undefined` rejection reason). Write settlement is an accounting boundary, not a durability guarantee: a buffering Writer must finish or report its work during `close()`, and successful close cannot guarantee preservation across crashes or power loss.

The Player is a separate CLI package. Install its packed artifact independently and run `event-tape view ./recordings/session.jsonl`; it serves local static assets on loopback and opens the browser. It does not upload recordings. Playback is view-only and does not emit events to the original application. Player accepts this tool's JSONL schema only; it loads recordings in memory, so available browser memory is a practical constraint. The 50 MB and 100,000-event figures are tested targets, not hard limits or performance guarantees beyond those sizes.
