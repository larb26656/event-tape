# SDK Recorder / WritePipeline / Writer Refactor

Status: ready-for-agent

## Problem Statement

ผู้ดูแล Event Tape ต้องแก้ไข Recorder ที่ปัจจุบันรวมทั้งการเตรียมเหตุการณ์ การสร้าง metadata การจัดคิว การนับ buffer การส่งงาน และ shutdown ไว้ด้วยกัน แม้จะมี Writer แยกแล้วก็ตาม ความรับผิดชอบเหล่านี้ทำให้ตรวจสอบ lifecycle และรักษาพฤติกรรมเดิมระหว่างปรับปรุงโค้ดได้ยาก

การทดสอบ Recorder ปัจจุบันยังรวมพฤติกรรมของหลาย module และ real-file integration ไว้ในชุดที่ตั้งชื่อตาม package entry point ทำให้ขอบเขตความรับผิดชอบและต้นเหตุเมื่อ test ล้มเหลวไม่ชัดเจน

จากการทดลอง source ปัจจุบันบน Node พบ correctness bugs สองกรณี: getter ของ payload ที่เรียก close ระหว่าง record ทำให้ Writer ถูกปิดก่อนส่ง event ไปเขียน และ getter ของ source ที่เรียก record ซ้อนทำให้สอง event ได้ sequence เดียวกัน ผู้ใช้อนุมัติให้แก้สองกรณีนี้ใน refactor ด้วย โดยไม่ถือว่าต้องรักษาพฤติกรรมที่ผิดเหล่านี้ไว้

## Solution

แยกการทำงานภายใน SDK เป็นสาม module โดยคง public Recorder และ Writer interfaces รวมทั้งพฤติกรรมปกติเดิม:

- **Recorder** เตรียมและตรวจ payload, snapshot แบบ synchronous, สร้าง Recording envelope, กำหนด sequence และเวลา และคำนวณ byte cost ตามนิยามเดิม
- **WritePipeline<T>** เป็น module ภายในแบบ generic ที่รับผิดชอบ FIFO, buffer accounting, deferred dispatch, fail-stop, drain และการประสาน shutdown รวมถึงการเรียก Writer.close
- **Writer** รับ structured Recording event และรับผิดชอบ serialization, I/O และ cleanup ตาม destination

จัด tests ตาม interface ของแต่ละ module และเก็บ integration smoke แบบไฟล์จริงพร้อม cross-layer regressions เฉพาะจุดเชื่อม ไม่คัดลอก behavior matrix เดียวกันไปทุกชั้น ไม่เพิ่ม public capability, dependency, batching, retries, timers หรือ durability guarantee

## User Stories

1. As an SDK user, I want to keep calling record and close through the existing Recorder interface, so that this internal refactor requires no application changes.
2. As an SDK user, I want file configuration and custom Writer injection to remain mutually exclusive, so that destination selection stays unambiguous.
3. As an SDK user, I want invalid destination configuration rejected before resources are opened, so that constructor failures do not create unintended files.
4. As a File Writer user, I want parent-directory creation and exclusive file opening to remain synchronous, so that setup failures are reported immediately without modifying existing recordings.
5. As an SDK user, I want payload validation and snapshotting completed before record returns, so that later mutations cannot change an accepted event.
6. As an SDK user, I want invalid or lossy payloads rejected synchronously, so that rejected input cannot silently alter my Recording.
7. As an SDK user, I want invalid events to leave previously accepted work intact, so that a single bad input does not poison the queue.
8. As an SDK user, I want only accepted events to consume sequence numbers, so that rejection does not create sequence gaps.
9. As an SDK user, I want only accepted events to establish the elapsed-time origin, so that rejected input does not distort Recording timing.
10. As an SDK user, I want the existing envelope version, timestamp, elapsed time, source, optional direction, and payload semantics preserved, so that Writers and the Viewer continue to understand my Recording.
11. As an SDK user, I want record to continue meaning synchronous queue acceptance rather than completed I/O, so that application code retains its existing execution model.
12. As a Writer author, I want structured Recording events rather than pre-encoded JSONL, so that my Writer remains free to choose its output format.
13. As a Writer author, I want synchronous and asynchronous methods to remain supported, so that simple destinations do not need artificial asynchronous work.
14. As a Writer author, I want events dispatched one at a time in acceptance order, so that I do not need a duplicate ordering queue.
15. As an SDK user, I want Writer callbacks deferred until Recorder metadata state is committed, so that callback-driven recording cannot observe half-accepted state.
16. As an SDK user, I want the existing default buffer limit and configuration preserved, so that the refactor does not unexpectedly change acceptance capacity.
17. As an SDK user, I want queue capacity measured by canonical v1 JSONL UTF-8 bytes including newline regardless of Writer format, so that the existing buffer contract remains predictable.
18. As an SDK user, I want in-flight events included in the buffer budget, so that a slow write cannot prematurely free capacity.
19. As an SDK user, I want overflow to reject only the new event synchronously, so that accepted events can still finish.
20. As an SDK user, I want capacity released after a write settles, so that recording can resume when there is room.
21. As an SDK maintainer, I want skipped events after a Writer failure to release their accounting, so that failed queues finish draining without stale charges.
22. As an SDK maintainer, I want one accounting ledger and no retained serialized duplicate of each queued event, so that ownership is clear without needless memory retention.
23. As an SDK user, I want the first Writer failure to stop subsequent dispatch and reject future records, so that a failed Recording does not continue unpredictably.
24. As an SDK user, I want optional onError notified once for the authoritative write failure, so that I can observe failure without duplicate notifications.
25. As an SDK user, I want an exception from onError not to replace the write failure or prevent cleanup, so that diagnostics cannot corrupt shutdown.
26. As an SDK user, I want close to stop admission immediately and wait for accepted work, so that shutdown has a clear completion point.
27. As an SDK user, I want repeated close calls to return the same Promise object, so that all shutdown callers observe one operation and outcome.
28. As an SDK user, I want the Writer closed exactly once even after write failure, so that resources are cleaned up consistently.
29. As an SDK user, I want a write failure to remain authoritative when cleanup also fails, so that shutdown does not hide the original cause.
30. As an SDK user, I want cleanup failure surfaced when writes succeeded, including an undefined rejection reason, so that shutdown failures are not mistaken for success.
31. As an SDK user, I want an unfinished event rejected if an input getter closes the Recorder, so that no event is admitted after shutdown starts.
32. As an SDK user, I want nested record calls during input preparation rejected without poisoning the Recorder, so that reentrancy cannot create duplicate sequence numbers.
33. As a Writer author, I want to be able to record another event from a Writer callback while admission remains open, so that safe callback-driven recording continues to work.
34. As a Writer author, I want the completion and shutdown dependency rules documented, so that I do not create a circular wait by awaiting the owning Recorder's close.
35. As an SDK maintainer, I want Recorder tests to focus on preparation, metadata, and admission interactions, so that event-model failures are easy to locate.
36. As an SDK maintainer, I want Pipeline tests to exercise its generic interface with controlled Writers, so that ordering, capacity, and lifecycle can be verified independently of JSONL and files.
37. As an SDK maintainer, I want File Writer tests to retain real-filesystem coverage, so that serialization and resource behavior remain verified at their owning module.
38. As an SDK maintainer, I want a small automated real-file integration smoke and selected cross-layer regressions, so that correct individual modules cannot hide incorrect composition.
39. As an SDK maintainer, I want tests to assert observable behavior rather than internal layout or forwarding calls, so that implementation changes do not require rewriting incidental assertions.
40. As a package consumer, I want the built SDK to retain its existing exports and work outside the monorepo, so that internal module extraction does not break package consumption.

## Implementation Decisions

### Scope and compatibility

- This is an internal architecture refactor within the existing SDK package, not a new feature or package split. Preserve the public Recorder, RecorderInput, RecorderOptions, Writer, and File Writer configuration interfaces and exports.
- Preserve constructor-time selection of exactly one destination: file or injected Writer. Reject missing or ambiguous configuration before opening resources. Keep synchronous parent-directory creation and exclusive file creation for the file destination.
- Keep Writer ownership exclusive to one Recorder. Do not introduce shared ownership, a global ownership registry, or destination replacement during a Recording.
- Keep the Recording envelope schema and format version unchanged. Do not modify the Viewer or shared parser for this work.
- The approved exceptions to behavior preservation are the two demonstrated reentrancy bugs described below. Do not expand validation, add unrelated reliability behavior, or silently redefine existing guarantees.

### Recorder responsibilities and acceptance

- Recorder owns payload validation, synchronous detached snapshotting, Recording envelope creation, sequence assignment, timestamp generation, monotonic elapsed timing, and canonical byte-cost calculation.
- Keep the current lossless JSON validation/snapshot contract and synchronous serialization-error behavior; this refactor is not a redesign of accepted payload types.
- Preserve an early admission check before reading and validating caller-controlled input, including the current precedence of an existing write failure over closed state and input validation errors.
- Treat successful Pipeline enqueue as the acceptance point. Calculate candidate metadata without committing sequence or time origin; commit both only after enqueue succeeds. Rejected validation, overflow, shutdown races, and reentrant calls must not consume metadata state.
- Reject nested record calls while a record call is preparing input through metadata commitment. Release this guard on every exit, including exceptions. The guard is local admission protection, not a Pipeline failure.
- A getter may call close while Recorder prepares input. Pipeline enqueue must check admission again and reject the unfinished event if closing has started. Previously accepted work must still drain normally, and the rejected event must never reach Writer.write.
- Keep Writer dispatch deferred until after synchronous record processing finishes. A Writer callback may record another event while admission remains open; the preparation guard must not prohibit this safe case.

### Internal Pipeline interface and scheduling

- Keep WritePipeline<T> internal to the SDK and genuinely generic. It must not depend on Recording envelopes, JSONL, filesystem details, sequence numbers, timestamps, or payload validation.
- The proposed internal factory accepts a structurally typed destination with write(T) and close(), plus maxBufferedBytes and optional onError. Both destination methods retain void-or-Promise completion.
- The Pipeline interface consists of assertAccepting(), enqueue(item, accountedBytes), and close(). assertAccepting preserves early error precedence; enqueue independently rechecks admission and capacity. Do not expose queue internals, accounting counters, or mutable lifecycle state for tests.
- Keep the current Promise-tail FIFO approach initially rather than adding a second queue or a scheduling framework. At most one Writer.write may be active, and dispatch order must match successful enqueue order.
- enqueue remains synchronous, does not invoke Writer or other caller callbacks inline, and throws on failed admission without accepting the event or latching a new Pipeline failure.

### Buffer accounting and memory ownership

- Preserve maxBufferedBytes and its default of 16 MiB.
- Recorder computes each candidate envelope's canonical v1 JSONL UTF-8 byte cost, including its terminating newline, regardless of the selected Writer's output format.
- Pass the numeric cost with the prepared envelope into enqueue. Pipeline alone owns the aggregate ledger, counting both queued and in-flight events. Recorder must not keep a duplicate ledger.
- Queue ownership requires the envelope and its numeric charge, not an additional retained JSONL string or Buffer. Discard the temporary sizing representation after measurement. File Writer still performs its own destination serialization when dispatched.
- Reject an event synchronously when its charge would exceed remaining capacity. Allow acceptance at the exact limit. Overflow must leave prior work, failure state, sequence, and time origin unchanged.
- Release each accepted charge exactly once after its write settles, or when its event is skipped after a write failure. Do not release at dequeue or dispatch start.
- This is a logical pending-event budget, not a bound on heap usage, temporary serialization allocation, Writer-owned buffers, or custom destination output size.

### Failure and shutdown

- Latch the first Writer.write failure before notifying onError. Preserve the existing normalization of non-Error write failures into an Error.
- Notify optional onError once for the authoritative write failure. Ignore exceptions from the callback for failure precedence and do not await its return value.
- After write failure, skip subsequent queued writes, reject future records with the authoritative failure, release skipped accounting, and allow shutdown to reach Writer cleanup. Do not retry or silently resume.
- Validation, sizing, overflow, and preparation-reentrancy errors are per-event admission failures, not terminal Writer failures.
- Pipeline coordinates drain and calls Writer.close exactly once; Writer implements destination-specific cleanup. Recorder delegates public close to Pipeline, retaining public ownership of its Writer.
- close must stop admission synchronously before waiting. Drain accepted work, including failure handling and skipped events, before invoking Writer.close. Cleanup must still be attempted after a write failure.
- Repeated close calls, including calls after rejection or completion, return the same Promise object. Do not accidentally change identity through an async wrapper at Recorder or Pipeline.
- If writing and cleanup both fail, reject close with the first write failure. If writing succeeded but cleanup failed, preserve the cleanup rejection reason, including undefined. Preserve the distinction between no cleanup failure and a failure whose reason is undefined.
- Do not add flush() in this phase. Drain is private to close; there is no new non-closing completion operation.

### Writer completion contract

- Keep Writer.write(event) and Writer.close() unchanged; both support synchronous completion or a Promise of void. Writer continues to receive a structured event, not a pre-encoded destination representation.
- write settlement is the Pipeline's per-event completion and accounting-release point. If Writer retains work in its own buffers after settlement, Writer owns those buffers and must complete that work or report failure during close.
- File Writer continues to finish all partial filesystem writes before resolving write, and retains its existing serialization and cleanup behavior.
- Neither Writer.write nor Writer.close may return or await a shutdown operation whose completion depends on that same method completing, including close on the owning Recorder. Such use creates a circular dependency; do not add runtime cycle detection, timeouts, or fallback behavior.
- Successful write or close does not guarantee crash or power-loss durability.

## Testing Decisions

- The user explicitly approved three module test seams—Recorder, internal WritePipeline, and File Writer—plus a thin real-file integration smoke and targeted cross-layer regressions. This supersedes the earlier restriction to two module seams. No additional seam approval is needed before implementation.
- Good permanent tests assert observable behavior, transitions, ordering, capacity boundaries, error identity/precedence, and resource outcomes through the relevant module interface. Do not inspect private helpers, queue arrays, counters, source layout, incidental wording, or forwarding calls. Do not expose internals solely for testing.
- Prefer moving and adapting existing coverage to its owning seam over copying the same matrix into every suite. Replace assertions coupled to incidental implementation behavior rather than repinning them. Use deterministic controlled completion, not sleep-based scheduling.

### Recorder module

- Use the real Pipeline with an array-backed or controlled Writer; do not introduce Pipeline mocks or dependency-injection machinery solely to assert delegation.
- Cover synchronous snapshot isolation, invalid/lossy payload rejection and subsequent valid acceptance, envelope metadata and optional direction, sequence continuity, and acceptance-based elapsed-time origin.
- Retain destination-selection behavior, especially rejecting ambiguous or missing configuration before any file-open side effect.
- Verify canonical byte-cost policy here: UTF-8 rather than character count, inclusion of newline, and independence from custom Writer output format. The generic Pipeline suite must not construct JSONL to test its own capacity logic.
- Keep selected cross-layer regressions: buffer overflow does not consume sequence or time origin; early failed/closed admission retains precedence over invalid input; closing during a payload getter prevents the unfinished event from being queued; nested preparation cannot produce duplicate sequences and does not poison later valid recording.
- Preserve a public-interface check of stable close Promise identity so a Recorder wrapper cannot break the Pipeline contract.

### Pipeline module

- Import the internal module directly without adding a public package export. Use plain generic items, explicit numeric byte charges, and controlled synchronous/asynchronous Writers.
- Cover FIFO and absence of overlapping writes, deferred initial dispatch, and a Writer callback enqueueing additional work while admission is open.
- Cover exact capacity, one-over-limit rejection, in-flight accounting, unchanged accepted work after overflow, and restored admission after completion.
- Cover synchronous throws and asynchronous write rejection, queued-event suppression, first failure identity, single onError notification, throwing onError, later admission failure, and cleanup after failure.
- Cover close stopping admission immediately, waiting for in-flight and queued work, invoking cleanup exactly once after dispatch ends, stable Promise identity, write-over-cleanup failure precedence, and cleanup-only failures including undefined reasons.
- Observe accounting through acceptance and rejection behavior, not through a test-only counter. Where failed/skipped cleanup behavior is verified, assert shutdown completion and suppression of writes rather than inaccessible internal state.

### File Writer module

- Preserve the existing independent suite using real temporary files and controlled filesystem writes.
- Cover JSONL output, parent directories, exclusive creation without changing existing files, synchronous open errors, partial writes, I/O failures, and resource cleanup.
- Do not duplicate Recorder preparation or Pipeline lifecycle matrices here. Do not add a permanent deadlock test that hangs the suite for unsupported circular shutdown dependencies.

### Integration smoke and verification

- Keep a small automated integration suite in normal CI through public createRecorder with file configuration. Record distinct events, mutate an original payload after record, await close, read the real file, and parse it with the shared parser.
- Assert snapshot preservation, version/metadata, optional direction, and event order. A bare no-throw assertion or a file-exists check is insufficient.
- Move the existing real-file Recorder case into this suite instead of retaining a duplicate. Keep failure matrices at their owning modules, except the selected cross-layer regressions above.
- Existing prior art includes the array-backed Writer, deferred write gates, payload mutation assertions, canonical UTF-8 boundary checks, temporary-file integration, and File Writer partial-write controls. Reuse these patterns without introducing a shared test framework unnecessarily.
- Before completion, run the SDK tests, typecheck, lint, and build. Exercise the changed path with a real-file record/close/parse smoke beyond unit tests. Build and exercise the packed SDK from an external Node.js ESM consumer for both default file configuration and custom Writer use; verify actual output and existing exports without adding export-forwarding unit tests.
- Update SDK responsibility and lifecycle documentation to match the agreed split, buffering policy, ownership, reentrancy behavior, and Writer dependency rules.

## Out of Scope

- New public Recorder methods, public Pipeline exports, changes to Writer method types, or changes to Recording schema, Viewer, parser, or supported runtime targets.
- flush(), whether on Recorder, Pipeline, or Writer, and any additional non-closing drain interface.
- Batching, retries, timers, scheduling frameworks, disk durability guarantees, fsync policies, automatic recovery, or deadlock detection.
- Additional built-in Writers, shared Writers, ownership registries, fan-out, hot-swapping destinations, or new package/plugin infrastructure.
- Redaction, listeners, protocol interpretation, new payload-validation rules, telemetry, signal handling, or unrelated fixes.
- Treating maxBufferedBytes as a cap on total memory or actual destination output, or eliminating File Writer serialization by replacing the structured Writer contract with encoded data.
- Testing private implementation details, introducing mock-only forwarding tests, or duplicating every edge case in the integration suite.

## Further Notes

- The user explicitly accepted decisions Q1–Q6: Pipeline-coordinated Writer cleanup; no flush in this phase; Recorder-supplied byte charges with Pipeline-only accounting; both demonstrated reentrancy fixes; unchanged Writer methods with completion/dependency rules; and the agreed module/integration test split. The design interview is complete.
- This spec supersedes the internal responsibility allocation and two-seam restriction of [SDK Recorder / Writer Separation](../sdk-writer-separation/spec.md), while retaining its public ownership, destination-selection, structured-event, buffering, failure, and durability contracts.
- WritePipeline is an internal implementation term, not a new user-facing domain concept. The existing glossary meanings of Recorder, Writer, and Recording remain valid.
- An investigation against the current source on Node observed Writer.close before Writer.write when a payload getter closed the Recorder, duplicate sequence 1 from source-getter reentrancy, and a pending circular shutdown dependency when write returned the same Recorder's close Promise. It also exercised the existing in-flight UTF-8 budget and write-failure precedence. This is investigation evidence, not a claim that the implementation or test suite has been changed or verified after refactoring.
- No prototype or implementation was produced during the design conversation. This document authorizes the described implementation work; it does not claim that work is complete.
- If a non-closing flush becomes necessary in a future scope, the agreed direction is a barrier over the events accepted before that call, not waiting for a globally empty queue. It must not imply Writer-buffer flushing or disk durability. Its implementation and detailed failure semantics are deferred.
