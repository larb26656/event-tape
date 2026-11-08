# Event Tape

<p align="center">
  <img src="docs/event-tape-logo.png" alt="Event Tape pixel art cassette logo" width="400">
</p>

Record application events and inspect them later on a timeline. Event Tape pairs a headless SDK for writing recordings with a local Player for exploring event sequences, timing, and payloads.

![Event Tape Player showing the sample recording, timeline, and event JSON](docs/viewer-screenshot.png)

## What you can do

- Record events from your application's own listeners to a JSONL file.
- Capture direct HTTP/1.1 requests or proxy them to an HTTP or HTTPS upstream with the CLI.
- Capture lines appended to an existing UTF-8 log file without changing its producer.
- Open recordings locally, search their events, and inspect their raw JSON.
- Navigate the timeline, select a playback range, and control playback speed.

Playback is **view-only**: it does not send events back to an application. Replay through an application or protocol adapter is not supported.

## Requirements

- Node.js >=22.12.0 for the Player CLI (the Recorder SDK runtime requirement remains unchanged)
- pnpm 11.9.0 (Corepack can provide the pinned version)

## Quick start

Clone this repository, install its dependencies, and open the included 40-event sample recording:

```sh
pnpm install
pnpm view:sample
```

The shortcut builds the CLI and Player and opens the sample in your browser. The Player runs locally.

In the Player, search filters the event list without changing playback or the inspected event. Select an event to pause playback and move the playhead to it. Focus an event row and use ↑ or ↓ to select the previous or next visible event; navigation stops at the ends of the list. Arrow keys in the search field remain available for editing. Drag on the timeline to select an inclusive playback range.

The Player keeps file controls in a compact header, with independently scrolling event and JSON panes above a full-width playback controls. Drag the divider or use its arrow keys to resize the panes; on narrow screens the panes stack.

## Use Event Tape in your project

The SDK can be packaged locally and installed into a service without publishing to an npm registry.

### 1. Build and install

From the repository root, build the SDK and pack it into a local directory:

```sh
pnpm install
pnpm --filter @event-tape/sdk build
mkdir -p /tmp/event-tape-pack
cd packages/sdk
pnpm pack --pack-destination /tmp/event-tape-pack
```

The current SDK version is `0.0.0`, so this creates `/tmp/event-tape-pack/event-tape-sdk-0.0.0.tgz`. Use the filename printed by `pnpm pack` if the version changes. This is a tarball, not a local registry; copy it to the service's machine or build environment if needed.

From the service directory, install the tarball:

```sh
npm install /tmp/event-tape-pack/event-tape-sdk-0.0.0.tgz
```

The SDK requires Node.js 22 or later and is ESM-only. Import it with `import { createRecorder } from '@event-tape/sdk'`. To update it after changing the SDK, rebuild and repack it, then reinstall the resulting tarball in each service. Use a new package version when distributing updates so services and lockfiles can distinguish builds.

The Player CLI is separate from the SDK. To run it without installing a package, build it from the repository root:

```sh
pnpm --filter @event-tape/cli... build
```

Then use `node packages/cli/dist/cli.mjs` in place of `event-tape` in the examples below. For a published CLI, install it with `npm install --global @event-tape/cli`.

For local development, `pnpm local:build:cli` builds the CLI and links `event-tape` into pnpm's global bin directory. That directory must be on `PATH` (run `pnpm setup` if needed). The link points into this repository.

Run `pnpm local:build:sdk` to build the SDK and create `event-tape-sdk.tgz` in the repository root. The command prints an `npm install` command with its absolute path for use in another project.

### 2. Record events
To capture direct HTTP requests:

```sh
event-tape record http --port 8080
curl -X POST http://127.0.0.1:8080/events -d 'hello'
# Press Ctrl+C to stop, then:
event-tape view .tape/<announced-filename>.jsonl
```

The listener defaults to `127.0.0.1` and an OS-assigned port; its actual address and output file are printed on startup. Use `--host` to expose another interface explicitly, `--port` to select a port, and `--output path/to/file.jsonl` to choose a file. Otherwise recordings are created in `.tape` under the working directory with a sortable UTC timestamp and random word. Parent directories are created; existing files are never overwritten or appended to.

Direct capture is the default (`--mode capture`): the HTTP input consumes ordinary HTTP/1.1 requests and responds with 204 after the Recorder accepts the request event; this is **not** a durability guarantee. It records no synthetic response.

To record traffic while forwarding it to an existing service, configure a fixed upstream and point your application at the listener:

```sh
event-tape record http --mode proxy --upstream https://example.com --port 8080
curl http://127.0.0.1:8080/api?limit=10
```

Proxy mode requires `--upstream` with an HTTP or HTTPS origin (no credentials, path, query, or fragment); it is not a client-controlled open proxy. It preserves the request method, path and query, forwards response status, headers and body, passes redirects back without following them, and does not retry requests. Request and response bodies stream with backpressure rather than being buffered in full. Recording truncation and header redaction do not truncate or modify forwarded traffic.

Select the HTTP input with `record http`. Session options such as `--output` and `--shutdown-timeout` belong to `record`; HTTP options and the mutually exclusive `--preset` and `--preset-file` belong to `http`. The builtin `otel` preset configures the HTTP proxy input and requires your own upstream:

```sh
event-tape record http --preset otel --upstream http://127.0.0.1:4318 --port 8080
```

CLI input implementations are registered in `packages/cli/src/inputs/registry.ts`; the same registry supplies record subcommands and input lookup.

It captures HTTP traffic only: it is not a collector, an OTLP/gRPC endpoint, or a semantic telemetry decoder.

A plain YAML file specifies the selected input and its options; its `input` must match the selected subcommand:

```yaml
input: http
options:
  mode: proxy
  upstream: http://127.0.0.1:4318
  host: 127.0.0.1
  port: 8080
  bodyLimit: 1024
  redact: true
  redactHeaders: [x-api-key]
  idleTimeout: 30000
```

Run `event-tape record http --preset-file ./record.yaml`. For direct capture use `mode: capture` and omit `upstream`. Explicit CLI options override individual preset options, then input defaults apply; for example `--no-redact` overrides `redact: true`, and `--redact` overrides `redact: false`. Repeated `--redact-header` values replace the preset's additional list; the default sensitive header list still applies when redaction is enabled. Output and shutdown timeout are CLI session settings, not preset fields. Presets do not support inheritance, expressions, executable transforms, or external inputs.

HTTP options are validated before a recording is created or a listener is opened. Unknown preset fields are rejected. Port must be an integer from 0 to 65535, body limit from 0 to 8388608 bytes, and idle timeout from 1 to 2147483647 ms; CLI numeric values must contain decimal digits only. Proxy mode requires an HTTP or HTTPS upstream origin without credentials, path, query, or fragment; capture mode does not accept an upstream.

Proxy request and response events share a session-unique `requestId` and retain their start times. Each side is emitted when its body ends or is cut short, so a crash can lose an open side; Recorder ordering reflects acceptance, not request start time. A connection failure produces 502 and an idle timeout produces 504 if the response has not started, with a correlated error event; the session can accept later requests. After a response has started, an error ends the connection instead of replacing its status, and partial traffic is marked incomplete. Client disconnects cancel unnecessary upstream work.

The listener supports HTTP/1.1, not receiving HTTPS, HTTP/2, CONNECT tunnels, HTTPS interception, or WebSocket upgrades. HTTPS is supported for the configured upstream. Playback is inspection only, not replay.

Body capture retains the first 65536 bytes per request and response by default; `--body-limit <bytes>` changes the limit. The event identifies UTF-8 or base64 encoding, retained byte count, truncation, and incomplete bodies separately. A truncated JSON or image body is only a prefix. Capture is bounded to 128 concurrent requests and 8 MiB aggregate retained body bytes (and the per-body limit cannot exceed 8 MiB); overload stops the session rather than silently dropping events. The Recorder also has a 16 MiB accounted pending-write limit, not a bound on total process memory.

Authorization, Cookie and Set-Cookie headers are redacted case-insensitively in recorded headers by default, in both directions. Repeat `--redact-header <name>` to add names, or explicitly use `--no-redact` to retain all header values. This does **not** sanitize URLs, query strings or bodies, which may contain secrets; inspect recordings before sharing them.

The default idle timeout is 30000 ms, adjustable with `--idle-timeout <ms>`; it is not a total lifetime limit for an active stream. Ctrl+C stops new work and drains in-flight requests, proxy traffic and Recorder writes within one 10000 ms budget; `--shutdown-timeout <ms>` adjusts it. A recording failure, overload or deadline expiry exits unsuccessfully and may leave an incomplete recording.

### File input

```sh
event-tape record file --path ./app.log --path ./worker.log
# Append log lines, press Ctrl+C, then open the announced Recording:
event-tape view .tape/<announced-filename>.jsonl
```

Relative paths are resolved against the invocation working directory. A missing path is awaited; when it appears, it is read from the beginning. Each existing path must be a readable regular file; directories, named pipes, and other non-regular paths are rejected. Capture begins at EOF by default for files present initially; if a last line is unfinished, its continuation is skipped through the next newline. Use `--from-start` to include existing content from every file. Each session starts independently; there are no resume checkpoints.

File options can also be declared in a Record Preset:

```yaml
input: file
options:
  paths: [./app.log, ./worker.log]
  fromStart: true
```

Use `event-tape record file --preset-file record.yaml`. Specify one or more literal paths, repeating `--path` on the CLI; CLI paths replace the entire preset list, and explicit CLI options override preset values. Unknown options and invalid types are rejected before capture.

Each line becomes a standard Recorder event with `source: "file"`. A complete line containing valid JSON is recorded as `{ "path": "<absolute path>", "json": <parsed value>, "partial": false }`, including JSON scalars and arrays. If parsing fails or would change a number's value, the original line is recorded instead as `{ "path": "<absolute path>", "text": "<raw line>", "partial": false }`. Parsing preserves values rather than JSON formatting; duplicate object keys keep their last value. A nonempty unfinished line at shutdown or a detected generation boundary is always recorded as text with `partial: true`; fragments from different generations are never joined. LF and CRLF terminators are removed; other whitespace and blank lines are retained in text. Lines are not timestamped from the source or redacted. Paths and log contents can contain secrets; inspect recordings before sharing.

Input must be valid UTF-8 and each line is limited to 1,048,576 source bytes excluding LF/CRLF, independently per file. Invalid or incomplete UTF-8, oversized lines, read failures, and Recorder or Writer failures end the entire session unsuccessfully. On SIGINT or SIGTERM, capture freezes a separate size boundary for each file, drains through those boundaries and flushes valid partial lines, all within the shared `--shutdown-timeout` budget.

All files share one Recorder. Events retain their order within each file; the combined sequence reflects Recorder acceptance, not a guaranteed occurrence-time order across files.

File following tracks the configured path across disappearance, replacement, and detected truncation, reading each new generation from the beginning. It is best-effort, not a lossless audit: rapid rotation or truncation and regrowth may destroy bytes before they can be read or before the change is observed, and those bytes cannot be recovered. Observed errors still fail the session. Globs, directory discovery, multiline grouping, transforms, and resume checkpoints are not supported.

### SDK input

Connect the SDK to an application-owned listener. The SDK does not install listeners or interpret protocol messages. Filter secrets before recording, and await `close()` before exiting.

```js
import { createRecorder } from '@event-tape/sdk'

const recorder = createRecorder({ file: './recordings/session.jsonl' })
const onMessage = (message) => {
  recorder.record({
    source: 'my-app',
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

### 3. Open a recording

```sh
event-tape view ./recordings/session.jsonl
```

Alternatively, run the built CLI directly from the checkout:

```sh
node packages/cli/dist/cli.mjs view ./path/to/recording.jsonl
```

## Recording format and recovery

The Player opens Event Tape recording envelope format version 1 and parses it in a Web Worker. A complete final JSONL record is accepted with or without a terminating newline.

If the last line is invalid JSON and has no terminating newline, the Player keeps the complete preceding records and displays a recovery warning. If there are no preceding records, it shows an empty recording with the warning. This is best-effort recovery of a likely crash-truncated tail, not proof that the recording is complete: events still buffered in the recorder may never have reached disk.

Invalid JSON in a terminated or interior line, invalid envelopes, and unsupported versions reject the recording with a line number and cause; the Player does not skip damaged records. Empty recordings have no events to inspect.

## Development

Run these commands from the repository root:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

To run the CLI from the root during development, use `pnpm dev:cli` followed by
the CLI arguments. It builds the CLI and its workspace dependencies first:

```sh
pnpm dev:cli --help
pnpm dev:cli view ./sample-recording.jsonl
```

For example, record an HTTP request:

```sh
pnpm dev:cli record http --port 8080
```

In another terminal, send a request:

```sh
curl -X POST http://127.0.0.1:8080/events -d 'hello'
```

Press Ctrl+C in the CLI terminal to stop recording, then open the file printed
by the CLI with `pnpm dev:cli view <recording.jsonl>`.
