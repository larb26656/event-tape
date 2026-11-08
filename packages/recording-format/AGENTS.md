# Recording format agent guide

## Scope and consumers

This package is the shared Recording wire contract, not the Recorder or Player. Keep it usable in both Node.js and a browser Worker: validation and parsing belong here; filesystem access, UI state, and application-specific payload interpretation belong in consumers.

Paths below are relative to this directory; commands run from the repository root. Root agent instructions still apply.

## Tech stack

- **TypeScript + ESM** define the envelope types and parser API. This private workspace package exports `src/index.ts` directly; consumers compile or bundle it, so there is no standalone package build.
- **Native JavaScript JSON APIs and handwritten validation** parse JSONL and validate envelopes. Keep this shared path platform-neutral so the same implementation runs in Node.js and the Player's browser Worker.
- **Vitest** exercises validation and JSONL recovery; **TypeScript (`tsc --noEmit`)** checks types.

Dependency versions, exports, and scripts are authoritative in `package.json`; shared pnpm/Turborepo, ESLint, and Prettier tooling is defined in the repository-root `../../package.json`.

## Before changing the contract

- Read `src/index.ts` for `RecordingEnvelope`, `parseEnvelope`, and `parseRecordingJsonl`; read `src/index.test.ts` and `src/jsonl.test.ts` for acceptance and recovery behavior.
- For envelope or serialization changes, inspect the producer in `../sdk/src/index.ts` and consumer in `../../apps/player/src/recording.worker.ts`. Update both sides and their user-facing READMEs in the same change when the contract changes.
- When changing exports or introducing runtime dependencies, check consumer builds; source-level parser tests do not prove the SDK bundle or Player Worker still works.

## Invariants to protect

- Keep `payload` opaque (`unknown`) and required. Envelope validation checks the shared fields, not application schemas, source-specific rules, or redaction policies.
- Keep per-envelope validation separate from cross-event policy. The parser currently preserves input order and does not require sequences to be contiguous or timestamps to be sorted. Enforcing either would change which existing Recordings are accepted.
- Preserve the distinction between invalid JSON and an invalid envelope. Only a JSON parse failure on the final line without a terminating newline is recoverable with a warning and the preceding complete events. A schema-invalid final object, malformed middle record, or newline-terminated fragment is an error with a one-based line number.
- Accept complete final records with or without a newline, and empty Recordings. Interior blank records are errors; keep blank-line behavior explicit when changing line splitting or whitespace handling.
- `parseEnvelope` validates and returns the supplied object. Preserve payload and extra fields rather than normalizing, copying away fields, sorting, or silently repairing records.

## Verify the changed path

- Run `pnpm --filter @event-tape/recording-format test` and `pnpm --filter @event-tape/recording-format typecheck`; lint configuration is exposed through `package.json`.
- Add focused parser regressions for changed acceptance boundaries: complete vs truncated final records, newline termination, invalid envelopes, and useful line-number errors. Assert parsed data and the warning/error outcome, not just successful execution.
- For a contract change, run `pnpm --filter @event-tape/sdk test` and `pnpm --filter @event-tape/player test`, then record a real temporary file with the SDK, await `close()`, and open it with the built Player. Verify both successful loading and the changed rejection/recovery case; unit tests alone do not establish producer/consumer compatibility.
