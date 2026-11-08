# Viewer agent guide

## Scope and boundaries

This app owns local Recording inspection and the `event-tape` CLI. Playback is view-only; Replay into another application is outside this app's contract. Keep recordings on the user's machine and serve the production CLI on loopback.

Paths below are relative to this directory; commands run from the repository root. Root agent instructions still apply.

## Tech stack

- **React + TypeScript** render the browser UI; **Vite** handles development, browser assets, and the module Worker build.
- **Zustand vanilla** owns Playback state in `src/playback.ts`; React subscribes through `useStore`. Keep state transitions there rather than adding a second state-management layer.
- **Tailwind CSS + shadcn Base UI Nova** provide styling and UI primitives; **Lucide React** supplies icons. Follow the UI conventions below when extending them.
- **TanStack Virtual** renders the event list; **Canvas 2D** draws the timeline summary. Preserve these bounded-rendering paths for large Recordings.
- **react-resizable-panels** handles pane layout and resizing; **prism-react-renderer** tokenizes the JSON inspector.
- **Web Workers** load and parse Recordings off the main thread using the shared `@event-tape/recording-format` package.
- **Node.js built-in HTTP/filesystem APIs** implement the local CLI server; **tsdown** bundles that CLI separately from Vite's browser output.
- **Vitest** covers Playback logic; **TypeScript** checks browser and tooling code. Use the package scripts for checks rather than assuming a browser test runner exists.

Dependency versions and scripts are authoritative in `package.json`; the repository-root `../../package.json` defines the Node.js requirement and shared pnpm/Turborepo, ESLint, and Prettier tooling.

## Start with the affected boundary

- Loading or file replacement: read `src/App.tsx` and `src/recording.worker.ts`. Keep parsing in the Worker and validation in `../../packages/recording-format/src/index.ts`. Terminate superseded Workers and ignore stale responses so a previous file cannot replace the current Recording.
- Playback or selection: read `src/playback.ts`, `src/playback.test.ts`, and the **Playback behavior** section of `README.md` before changing transitions. Keep the clock and selection rules in the store, with React components dispatching actions.
- List or search: read `src/components/EventList.tsx`. Its sorted/filtered results map back to original event indices; selection must use those indices, not visible row positions. Search filters the list only, not Playback or the inspected event.
- Timeline: read `src/components/TimelineOverview.tsx` and `src/components/TimelinePanel.tsx`. Preserve inclusive ranges and keyboard alternatives to pointer gestures.
- CLI or distribution: read `src/cli.ts`, `scripts/build-cli.mjs`, and `vite.config.ts`. The shipped CLI serves assets beside itself, not the source tree or a running Vite server. The CLI bundler uses `clean: false` to retain Vite's output; preserve that build ordering.

## Invariants to protect

- Distinguish automatic Playback, nearest-event seeking, and exact list selection. Duplicate timestamps and quiet intervals make these different operations; preserve the tie-breaking contract in `README.md`.
- Keep an empty Recording distinct from no loaded file, loading, invalid input, and a recovered final-fragment warning. Zero-duration Recordings remain inspectable even though Playback and seeking are disabled.
- Keep the complete Recording available. Virtualize the event list and summarize the timeline with canvas rather than rendering one DOM node per event or dropping data. The size targets documented in `README.md` are not rejection limits.
- Render the complete envelope and payload as selectable text in the JSON inspector. Treat payloads as data, not HTML.
- Keep recently opened files session-local. Preserve keyboard focus when navigating virtualized rows and resizing panes, and keep narrow-screen panes usable.

## UI conventions

- For UI work, read **Viewer UI development** in `README.md`; use the existing shadcn Base UI Nova primitives in `src/components/ui/`. Add missing primitives through the documented shadcn workflow rather than creating a competing component system.
- Use semantic theme utilities and keep theme/syntax styling in `src/index.css`. Inline styles are appropriate for runtime geometry such as virtual row offsets.

## Verify the changed path

- Run `pnpm --filter @event-tape/viewer test` for state changes and `pnpm --filter @event-tape/viewer typecheck` for TypeScript changes; lint/build scripts live in `package.json`.
- For UI changes, run `pnpm --filter @event-tape/viewer dev`, open its printed URL, and load `sample-recording.jsonl` from the repository root through the file picker. Check the actual changed interaction at wide and narrow widths, including keyboard use; store tests do not prove rendering or focus behavior.
- For CLI, Worker, or build changes, run `pnpm --filter @event-tape/viewer build`, then `node apps/viewer/dist/cli.mjs view ./sample-recording.jsonl --no-browser`. Open the printed URL and verify the Recording and packaged Worker/assets load without the dev server. Stop the CLI after the smoke.
- Changes to distribution must also be checked from a packed install outside the workspace; a successful Vite dev session does not prove the shipped package works. Use **Target-size and external-package smoke** in `README.md` for the existing acceptance scenarios, and update that README when user-visible behavior changes.
