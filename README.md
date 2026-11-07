# Event Tape

## Requirements

- Node.js 22 or newer
- pnpm 11.9.0 (Corepack can provide the pinned version)

## Workspace commands

```sh
pnpm install
pnpm dev --filter @event-tape/viewer
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The Viewer is a static Vite application at `apps/viewer`; the Recorder SDK and private shared recording-format package are independent workspace packages. Ticket 01 establishes tooling only and intentionally contains no recording, schema, or playback behavior.

## CLI initialization

The monorepo was initialized with `pnpm create turbo@latest` (pnpm manager). The SDK was initialized with `pnpm create tsdown@latest packages/sdk --template minimal`. Viewer was initialized using the supported shadcn Vite template: `pnpm dlx shadcn@latest init --template vite --no-monorepo --cwd apps/viewer --name viewer --preset nova -y`. The private recording-format package was initialized with `pnpm init --bare --init-type module`. The CLI-created Vite/shadcn output and tsdown output are adapted to the workspace and pinned toolchain.
