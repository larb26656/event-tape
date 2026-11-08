# Recorder SDK agent guide

## Scope and boundaries

This package records application-supplied events to a new local JSONL file. The caller owns listeners, protocol interpretation, and filtering sensitive data. Keep those responsibilities out of the Recorder; the Viewer is a separate application.

Paths below are relative to this directory; commands run from the repository root. Root agent instructions still apply.

## Tech stack

- **Node.js + TypeScript + ESM** implement the Recorder. Use Node's built-in `node:fs` and `node:path` APIs for file lifecycle and `node:perf_hooks` for monotonic timing; this is not a browser SDK.
- **`@event-tape/recording-format`** supplies the shared envelope type. Keep Recording schema ownership in that package.
- **tsdown** produces the published ESM bundle and TypeScript declarations. The shipped SDK has no runtime dependencies; preserve standalone installation outside the monorepo.
- **Vitest** exercises recording against temporary files and controlled filesystem writes; **TypeScript (`tsc --noEmit`)** checks types.

Dependency versions, the Node.js requirement, exports, and scripts are authoritative in `package.json`; shared pnpm/Turborepo, ESLint, and Prettier tooling is defined in the repository-root `../../package.json`.

## Start here

- Read `README.md` for the public lifecycle and failure contract, `src/index.ts` for public exports, `src/recorder.ts` for Recorder behavior, and the adjacent Recorder/File Writer tests before changing recording or shutdown.
- For envelope changes, read `../recording-format/src/index.ts` and check the Viewer consumer in `../../apps/viewer/src/recording.worker.ts`.
- For publishing or exports, read `package.json` and `tsdown.config.ts`, then verify the packed consumer path described below.
- Test responsibilities follow behavior: `src/recorder.test.ts` covers Recorder behavior using controlled/array-backed Writers; `src/integration.test.ts` covers the public file configuration through a real temporary file and shared parser; `src/file-writer.test.ts` covers the File Writer and its filesystem/write lifecycle independently. Keep each behavior in its owning suite and avoid duplicate real-file Recorder cases.

## Invariants to protect

- File Writer creates parent directories and opens the destination synchronously with exclusive creation. Existing files remain untouched; appending or overwriting changes the public safety contract. It owns JSONL serialization, destination I/O, and its own buffers. Recorder owns validation, synchronous detached snapshots, envelope metadata, sequence/timing, and canonical UTF-8 byte-charge calculation. Internal WritePipeline owns FIFO dispatch, the single aggregate queued-plus-in-flight byte ledger, failure handling, draining, and exactly-once `Writer.close()`.
- `record()` snapshots and validates the payload before returning. Later caller mutation must not affect accepted data. Preserve synchronous rejection of serialization failures and lossy JSON values rather than quietly omitting or rewriting them.
- Only accepted events consume sequence numbers or establish the elapsed-time origin. Use monotonic elapsed time for timing and wall-clock ISO timestamps for the envelope timestamp.
- Pipeline dispatches accepted writes in FIFO order with no overlap. A successful `record()` means Pipeline acceptance, not flush or crash durability. Account for canonical JSONL UTF-8 bytes including the newline; reject only the new event that would exceed the logical budget. The charge is released once when its write settles, or when queued work is skipped after write failure. This budget does not bound temporary allocations, Writer buffers, or destination output.
- Keep the first write failure authoritative: normalize non-Error rejections, report through optional `onError` exactly once, reject later records, skip queued writes, release their charges, and reject `close()`. Callback exceptions do not replace the write failure.
- `close()` immediately stops acceptance, drains accepted work, and closes the Writer once. Repeated calls return the same promise. Cleanup-only failures preserve their rejection reason, including `undefined`; a write failure takes precedence over cleanup failure. A Writer that retains buffered work after `write()` settles must finish or report it during `close()`. Neither Writer method may await its owning Recorder's `close()`, because shutdown waits for the active Writer operation and would deadlock. Successful close does not guarantee crash/power-loss durability.

## Verify the changed path

- Run `pnpm --filter @event-tape/sdk test` and `pnpm --filter @event-tape/sdk typecheck`; use the existing temporary-file and controlled-write patterns for behavioral regressions. Lint/build scripts live in `package.json`.
- Exercise the changed lifecycle against a real temporary file: record distinct payloads, mutate an input after `record()`, await `close()`, then parse the resulting JSONL with the shared parser. Check payload snapshots, order, and optional direction. For failure changes, also exercise the relevant rejection without sacrificing earlier accepted records unless a write failure makes them unwritable.
- For build/export changes, run `pnpm --filter @event-tape/sdk build` and install a packed artifact in an external Node.js ESM project. Import the public package, create a Recording, await `close()`, and verify its contents; imports from `src/` cannot prove distribution works.
- Update `README.md` with any public API, payload, buffering, or shutdown-contract change. Keep failure and durability guarantees explicit.
