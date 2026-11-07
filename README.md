# Event Tape

## Requirements

- Node.js 22 or newer (Vite 8 requires Node.js 20.19+ or 22.12+)
- pnpm 11.9.0 (Corepack can provide the pinned version)

## Workspace commands

```sh
pnpm install
pnpm --filter @event-tape/viewer dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Opening the sample recording

The repository includes `sample-recording.jsonl`, a 40-event demo recording. Run this root shortcut to build the Viewer and open the sample in your browser:

```sh
pnpm view:sample
```

The Viewer runs locally; playback is for inspection and does not send events to an application. To open a different recording, use the Viewer CLI after building it:

```sh
pnpm --filter @event-tape/viewer build
node apps/viewer/dist/cli.mjs view ./path/to/recording.jsonl
```

In the Viewer, search filters the event list without changing playback or the inspected event. Focus an event row and use ↑ or ↓ to select the previous or next visible event; navigation stops at the ends of the list. Selecting a row pauses playback and moves the playhead to that event. Arrow keys in the search field remain available for editing.

## Using the SDK and Viewer in another project

Build both distributable packages from the repository root:

```sh
pnpm --filter @event-tape/sdk build
pnpm --filter @event-tape/viewer build
```

From the repository root, install the built SDK in your current project:

```sh
npm install ./packages/sdk
```

Install the Viewer CLI globally from this checkout:

```sh
npm install --global ./apps/viewer
```


The CLI is then available as `event-tape`:

```sh
event-tape view ./recordings/session.jsonl
```

Use the SDK from an application-owned listener. The SDK does not install listeners or interpret protocol messages; filter secrets before recording, and await `close()` before exiting:

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

Open the resulting recording with the globally installed Viewer CLI:

```sh
event-tape view ./recordings/session.jsonl
```

These checkout-based commands use locally built packages; they do not publish them to a registry.

The Viewer opens only the Event Tape recording envelope format (version 1), parsed in a Web Worker. A complete final JSONL record is accepted whether or not it ends in a newline. If the last line is invalid JSON and has no terminating newline, the viewer keeps the complete preceding records and shows a recovery warning; if none precede it, the viewer shows an empty recording with the warning. This is a best-effort recovery of a likely crash-truncated tail, not proof that the recording is complete: events still buffered in the recorder may never have reached disk. Invalid JSON in a terminated/interior line, invalid envelopes, and unsupported versions reject the recording with the line number and cause; the viewer does not skip damaged records. Empty recordings have no events to inspect.

## Playback and Replay

Viewer Playback is view-only: it advances through recorded elapsed time, supports pause, speed changes, seeking, and event selection, and never emits events to another system. Replay would re-execute events through an application or protocol adapter; that functionality is not part of this Viewer.

## CLI initialization

The monorepo was initialized with `pnpm create turbo@latest` (pnpm manager). The SDK was initialized with `pnpm create tsdown@latest packages/sdk --template minimal`. Viewer was initialized using the supported shadcn Vite template: `pnpm dlx shadcn@latest init --template vite --no-monorepo --cwd apps/viewer --name viewer --preset nova -y`. The private recording-format package was initialized with `pnpm init --bare --init-type module`. The CLI-created Vite/shadcn output and tsdown output are adapted to the workspace and pinned toolchain.
