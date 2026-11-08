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

- Read `README.md` for the public lifecycle and failure contract, `src/index.ts` for implementation, and `src/index.test.ts` before changing recording or shutdown.
- For envelope changes, read `../recording-format/src/index.ts` and check the Viewer consumer in `../../apps/viewer/src/recording.worker.ts`.
- For publishing or exports, read `package.json` and `tsdown.config.ts`, then verify the packed consumer path described below.

## Invariants to protect

- Create parent directories and open the destination synchronously with exclusive creation. Existing files remain untouched; appending or overwriting changes the public safety contract.
- `record()` snapshots and validates the payload before returning. Later caller mutation must not affect accepted data. Preserve synchronous rejection of serialization failures and lossy JSON values rather than quietly omitting or rewriting them.
- Only accepted events consume sequence numbers or establish the elapsed-time origin. Use monotonic elapsed time for timing and wall-clock ISO timestamps for the envelope timestamp.
- Serialize writes in acceptance order and finish partial writes before moving to the next event. A successful `record()` means queued, not flushed or crash-durable.
- Account for buffered UTF-8 bytes, not string length. Rejection at the byte limit must leave previously accepted writes queued and the rejected event uncommitted.
- Keep the first asynchronous write failure authoritative: report it through `onError` when supplied, reject later records, and reject `close()`. An exception from the error callback must not replace the write failure.
- `close()` immediately stops acceptance, drains queued work, and closes the descriptor. Repeated calls return the same promise. Require callers and examples to await it; do not add a process-exit hook as a substitute.

## Verify the changed path

- Run `pnpm --filter @event-tape/sdk test` and `pnpm --filter @event-tape/sdk typecheck`; use the existing temporary-file and controlled-write patterns for behavioral regressions. Lint/build scripts live in `package.json`.
- Exercise the changed lifecycle against a real temporary file: record distinct payloads, mutate an input after `record()`, await `close()`, then parse the resulting JSONL with the shared parser. Check payload snapshots, order, and optional direction. For failure changes, also exercise the relevant rejection without sacrificing earlier accepted records unless a write failure makes them unwritable.
- For build/export changes, run `pnpm --filter @event-tape/sdk build` and install a packed artifact in an external Node.js ESM project. Import the public package, create a Recording, await `close()`, and verify its contents; imports from `src/` cannot prove distribution works.
- Update `README.md` with any public API, payload, buffering, or shutdown-contract change. Keep failure and durability guarantees explicit.
