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

The Viewer opens only the Event Tape recording envelope format (version 1), parsed in a Web Worker. A complete final JSONL record is accepted whether or not it ends in a newline. If the last line is invalid JSON and has no terminating newline, the viewer keeps the complete preceding records and shows a recovery warning; if none precede it, the viewer shows an empty recording with the warning. This is a best-effort recovery of a likely crash-truncated tail, not proof that the recording is complete: events still buffered in the recorder may never have reached disk. Invalid JSON in a terminated/interior line, invalid envelopes, and unsupported versions reject the recording with the line number and cause; the viewer does not skip damaged records. Empty recordings have no events to inspect.

## CLI initialization

The monorepo was initialized with `pnpm create turbo@latest` (pnpm manager). The SDK was initialized with `pnpm create tsdown@latest packages/sdk --template minimal`. Viewer was initialized using the supported shadcn Vite template: `pnpm dlx shadcn@latest init --template vite --no-monorepo --cwd apps/viewer --name viewer --preset nova -y`. The private recording-format package was initialized with `pnpm init --bare --init-type module`. The CLI-created Vite/shadcn output and tsdown output are adapted to the workspace and pinned toolchain.
