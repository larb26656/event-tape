# SDK Recorder / Writer Separation

Status: resolved

## Problem Statement

SDK ปัจจุบันรวมการรับเหตุการณ์ การ snapshot payload การสร้าง metadata การจัดคิว การแปลง JSONL และการเขียนไฟล์ไว้ใน Recorder เดียว ผู้ใช้จึงเปลี่ยนปลายทางไม่ได้โดยไม่แก้ Recorder และ unit test ของ Recorder ต้องพึ่ง filesystem แม้ไม่ได้ทดสอบการเขียนไฟล์

## Solution

แยก Recorder ออกจาก Writer โดยเลือก Writer ตอนสร้าง Recorder หากระบุไฟล์ให้ใช้ File Writer อัตโนมัติ หากส่ง custom Writer ให้ส่ง event พร้อม metadata ไปยัง Writer นั้น ผู้ใช้สามารถจัดเก็บหรือแสดงผล event ด้วยวิธีอื่น และทดสอบ Recorder โดยไม่สร้างไฟล์ได้

## User Stories

1. As an SDK user, I want to create a Recorder with a destination file, so that existing usage remains straightforward.
2. As an SDK user, I want to supply a custom Writer when creating a Recorder, so that I can change destinations without modifying the Recorder.
3. As a Writer author, I want to receive structured events with metadata, so that I can choose my own output format.
4. As an SDK user, I want the Recorder to own sequence numbers and timing, so that all Writers receive consistent metadata.
5. As an SDK user, I want payloads snapshotted before record returns, so that later mutations cannot alter accepted events.
6. As an SDK user, I want invalid or lossy JSON payloads rejected synchronously, so that data is not silently rewritten.
7. As an SDK user, I want only accepted events to consume sequence numbers and establish the time origin, so that rejected input does not distort the Recording.
8. As a Writer author, I want synchronous and asynchronous writes supported, so that simple destinations do not require artificial asynchronous work.
9. As a Writer author, I want writes serialized by the Recorder, so that I do not have to implement another ordering queue.
10. As an SDK user, I want a bounded pending-event queue, so that a slow Writer cannot accumulate unbounded queued event data.
11. As an SDK user, I want queue overflow to reject only the new event, so that previously accepted events can still finish.
12. As an SDK user, I want close to stop acceptance immediately and drain queued writes, so that shutdown has a clear completion point.
13. As an SDK user, I want repeated close calls to return the same promise, so that multiple shutdown callers observe one outcome.
14. As an SDK user, I want the Recorder to close its Writer, so that resource ownership is unambiguous.
15. As an SDK user, I want write failures reported through the existing error contract, so that failures are never silently ignored.
16. As an SDK user, I want subsequent writes stopped after a Writer failure, so that a failed Recording does not continue unpredictably.
17. As a File Writer user, I want existing files rejected without modification, so that recordings are not accidentally overwritten or appended.
18. As a File Writer user, I want missing parent directories created and open failures reported synchronously, so that setup failures are visible immediately.
19. As a File Writer user, I want partial filesystem writes completed, so that accepted events produce complete JSONL records.
20. As an SDK maintainer, I want Recorder tests that use an array-backed Writer, so that recording behavior is testable without filesystem dependencies.
21. As an SDK maintainer, I want separate File Writer tests against real temporary files, so that filesystem behavior is verified at its own interface.
22. As a package consumer, I want the public exports available in the published ESM artifact, so that custom Writers work outside this monorepo.

## Implementation Decisions

- Keep one SDK package. Separate the Recorder module, Writer interface, and File Writer implementation internally. The package entry point contains public exports only; do not introduce generic utilities or additional package layers.
- Recorder owns input validation, synchronous payload snapshotting, existing v1 envelope metadata, monotonic elapsed timing, sequence assignment, queue accounting, ordered dispatch, and shutdown orchestration.
- Writer receives a structured Recording event, not pre-encoded JSONL. Writer owns its output format and destination. File Writer encodes JSONL and owns filesystem operations.
- Retain the shared Recording envelope schema unchanged. No Viewer or parser changes are required.
- Expose createRecorder, createFileWriter, Writer, and the relevant public Recorder types through the SDK entry point. Keep schema ownership in the existing recording-format package.
- createRecorder accepts either file configuration or a Writer, never both. Express this exclusivity in public types and reject ambiguous configuration at runtime before opening resources. A destination must be supplied; do not invent a default filename.
- File configuration selects File Writer automatically and preserves existing caller usage. Explicit createFileWriter accepts file configuration and opens the destination synchronously.
- Choose the Writer at Recorder construction; no replacement during a Recording.
- Writer provides write(event) and close(); both may complete synchronously or return a Promise of void. Recorder dispatches one write at a time and awaits completion before dispatching the next.
- Each Writer instance belongs to one Recorder. Recorder closes it after draining its queue. Shared Writer ownership is not supported; do not add a global ownership registry.
- record remains synchronous and means accepted into the queue, not flushed. Preserve payload validation and snapshot behavior, sequence and time-origin rules, optional direction, and timestamp semantics.
- Retain maxBufferedBytes with its 16 MiB default. Measure pending events by UTF-8 byte size of their canonical v1 JSONL representation, including the terminating newline, regardless of Writer output format. This is not the actual custom output size and excludes buffers maintained inside a custom Writer.
- An event that exceeds available queue capacity is rejected synchronously without consuming metadata state or discarding earlier accepted events. Release its accounting after dispatch completes or the event is skipped following failure.
- On the first write failure, retain the authoritative error, invoke optional onError, stop dispatching subsequent queued events, reject later record calls, and reject close. An exception from onError must not replace the write failure. No retries or silent loss.
- close immediately stops new records, waits for the queue, and closes the Writer even after a write failure. Preserve the first write failure if Writer shutdown also fails; otherwise surface shutdown failure. Repeated close calls return the same Promise.
- File Writer preserves synchronous parent-directory creation and exclusive file creation, completes partial writes, and closes its file handle. Successful close does not promise crash or power-loss durability.
- Do not ship a Memory Writer. Tests may define small array-backed Writers locally.
- Update SDK usage and maintenance documentation to describe the new responsibilities, exports, custom Writer contract, ownership, buffering definition, and failure behavior. Preserve the Node.js ESM runtime target and standalone package consumption.

## Testing Decisions

- The user approved two test seams: Recorder through its public record/close interface with an injected array-backed Writer, and File Writer through its public interface with real temporary files. No additional private seams are needed.
- Good tests assert consumer-visible behavior, state transitions, ordering, boundaries, errors, and resource outcomes. Do not assert module layout, private helpers, export forwarding, or implementation wording.
- Recorder tests cover metadata and snapshots, synchronous invalid-payload rejection, accepted-event sequence continuity, UTF-8 queue boundaries, queue recovery after a completed write, serialized asynchronous dispatch, close draining/idempotence, and rejection after shutdown begins.
- Writer-failure cases cover synchronous throws and asynchronous rejection, authoritative first failure, queued-event suppression, onError exceptions, and closing resources after failure. Include shutdown-failure precedence where needed to protect the lifecycle contract.
- File Writer tests cover new-file JSONL output, parent-directory creation, exclusive creation without modifying existing data, synchronous open errors, partial writes, write errors, and resource shutdown.
- Reuse prior art from the SDK's existing Vitest suite: temporary directories, controlled filesystem writes, payload mutation after acceptance, byte-limit checks, and lifecycle failures. Move behavior to its correct seam instead of keeping duplicate filesystem-dependent Recorder unit tests.
- Retain a real-file integration smoke scenario using default file configuration: record distinct events, mutate an input, await close, then parse JSONL with the shared parser to verify snapshots, metadata, order, and optional direction.
- Build and exercise the packed SDK from an external Node.js ESM consumer. Verify default file creation and a custom Writer through public package exports. Run SDK tests, typechecking, and lint after integration.

## Out of Scope

- Hot-swapping Writers, fan-out to multiple Writers, or sharing one Writer between Recorders.
- Additional built-in Memory, console, network, database, or browser Writers.
- Browser/Bun/Deno support, Viewer redesign, live streaming into Viewer, or Recording schema changes.
- New listeners, protocol interpretation, redaction, retries, signal handlers, telemetry, or durability guarantees.
- Splitting the SDK into multiple packages or adding generic plugin infrastructure.
- Treating maxBufferedBytes as a hard cap on total process memory, custom Writer buffers, or actual encoded output bytes.

## Further Notes

- This spec records the SDK design agreed in the conversation, including default File Writer, constructor-time injection, metadata ownership, queue lifecycle, failure policy, and test separation.
- Folder organization is an internal module split: a thin package entry point, a Recorder module with adjacent tests, and a writers group containing the Writer interface and File Writer with adjacent tests.
- The retained JSONL-based queue budget deliberately leaves size-accounting knowledge in Recorder even when a custom Writer uses another format.
- Implemented on `integration/sdk-writer-separation` (`f4b0e47`); SDK tests, typecheck, lint, build, and packed external ESM consumer verification passed.
