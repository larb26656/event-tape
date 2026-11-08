# File Input: ติดตาม log ที่เขียนเพิ่ม

Status: resolved

## Problem Statement

ผู้ใช้ต้องการบันทึก log จากโปรแกรมที่เขียนลงไฟล์เป็น Recording เพื่อเปิดตรวจใน Player โดยไม่ต้องแก้โปรแกรมให้เรียก SDK หรือส่ง HTTP ผู้ใช้ต้องติดตามหลายไฟล์ระหว่างทำงาน รวมถึงเมื่อไฟล์ถูกหมุนหรือ truncate และต้องทราบเมื่อการบันทึกล้มเหลวแทนการได้ Recording ที่ขาดข้อมูลโดยไม่มีคำเตือน

ปัจจุบัน CLI มีเฉพาะ HTTP Input แต่มี Input registry, lifecycle และการจัดการ Recorder ร่วมอยู่แล้ว คำว่า file watcher ในงานนี้หมายถึงการตามอ่านข้อความ log ที่ append ไม่ใช่การบันทึกเหตุการณ์สร้าง/แก้ไข/ลบไฟล์ทั่วไป

## Solution

เพิ่ม Input ชื่อ `file` ใช้คำสั่ง `event-tape record file --path app.log` และระบุ `--path` ซ้ำเพื่อติดตามหลายไฟล์ แต่ละบรรทัดเป็นหนึ่งเหตุการณ์ เก็บข้อความ UTF-8 ตามต้นฉบับพร้อม path ของไฟล์ ไม่ parse JSON หรือปิดบัง secrets อัตโนมัติ

เริ่มอ่านท้ายไฟล์ที่มีอยู่โดยปริยาย หรือใช้ `--from-start` เพื่ออ่านข้อมูลเดิมก่อนตามต่อ ไฟล์ที่ยังไม่มีจะถูกรอและอ่านตั้งแต่ต้นเมื่อเกิดขึ้น ติดตามตาม path ต่อเมื่อ rotate หรือ truncate โดยไม่ต่อข้อความค้างข้ามไฟล์

ใช้ Recording format, Record Preset, output settings และ shutdown lifecycle เดิม เปิดผลลัพธ์ใน Player ได้โดยไม่ต้องเพิ่มตัวอ่านรูปแบบใหม่ การติดตามเป็น best-effort ไม่ใช่ audit ที่รับประกันไม่สูญหาย

## User Stories

1. As a CLI user, I want to record appended log lines, so that I can inspect application activity without modifying the application.
2. As a CLI user, I want an explicit file Input subcommand, so that I can select log capture independently from HTTP capture.
3. As a CLI user, I want to specify multiple literal file paths, so that I can inspect related logs in one Recording.
4. As a Recording reader, I want every event to identify its originating path, so that I can distinguish lines from different files.
5. As a CLI user, I want existing files to start at their current end by default, so that historical logs do not flood a new session.
6. As a CLI user, I want to opt into reading from the beginning, so that existing log content can be included deliberately.
7. As a CLI user, I want each session to determine its own starting position, so that previous sessions do not silently change its behavior.
8. As a Recording reader, I want an existing partial line skipped when starting at EOF, so that its later suffix is not presented as a complete line.
9. As a CLI user, I want missing files to be awaited, so that recording can start before the application creates its logs.
10. As a CLI user, I want newly created files read from the beginning, so that their first lines are captured.
11. As a CLI user, I want path-based following across rotation, so that replacing the log file does not require restarting the session.
12. As a CLI user, I want reading to restart after detected truncation, so that subsequent log lines continue to be recorded.
13. As a Recording reader, I want one event per newline-terminated line, so that line boundaries remain meaningful.
14. As a Recording reader, I want LF and CRLF logs supported, so that logs from either convention are readable without stray terminator characters.
15. As a Recording reader, I want blank lines preserved, so that the recorded text does not silently discard source content.
16. As a Recording reader, I want JSON-looking lines preserved as text, so that the Input does not invent parsing semantics.
17. As a Recording reader, I want split UTF-8 characters reconstructed across reads, so that normal incremental writes do not corrupt text.
18. As a CLI user, I want invalid UTF-8 to fail explicitly, so that replacement characters do not conceal source corruption.
19. As a Recording reader, I want unfinished lines emitted with a partial marker at shutdown or a file boundary, so that retained fragments are distinguishable from complete lines.
20. As a Recording reader, I want fragments from different file generations kept separate, so that unrelated text is never concatenated.
21. As a CLI user, I want a bounded line size, so that an unterminated line cannot consume unbounded memory.
22. As a CLI user, I want oversized lines to stop the session with an error, so that content is not silently truncated or skipped.
23. As a CLI user, I want Recorder rejection or Writer failure to stop capture unsuccessfully, so that missing events are not reported as a successful Recording.
24. As a CLI user, I want unreadable paths and directories rejected, so that configuration or permission problems are actionable.
25. As a CLI user, I want normal shutdown to drain to a finite file-size boundary, so that continuously writing applications cannot prevent shutdown indefinitely.
26. As a CLI user, I want the existing shutdown deadline honored, so that a stalled session can terminate with a clear failure.
27. As a CLI user, I want existing output selection and exclusive creation behavior preserved, so that log capture does not overwrite recordings.
28. As a CLI user, I want declarative Record Presets and explicit CLI overrides supported, so that repeatable file capture uses the same configuration model as other Inputs.
29. As a Player user, I want file events in the standard Recording format, so that I can inspect them with existing timeline and payload tools.
30. As a Recording reader, I want ordering to reflect Recorder acceptance, so that I do not mistake interleaved file reads for true cross-file occurrence order.
31. As a CLI user, I want a clear warning that log text is not redacted, so that I can avoid sharing credentials or other sensitive data.
32. As a CLI user, I want best-effort limitations documented, so that I do not depend on file capture as a lossless audit channel.

## Implementation Decisions

- Add a registered `file` Input using the existing InputDefinition and RunningInput contracts. Keep file-specific reading, framing and filesystem lifecycle inside the Input; generic orchestration must remain independent of network or filesystem transport details.
- Preserve the existing HTTP Input and its behavior. The shared registry must expose both Inputs through normal CLI command construction and lookup.
- Accept one or more literal paths through repeatable `--path`; do not expand globs or discover directory contents. Resolve relative paths against the invocation working directory. Identify the source path consistently in event payloads.
- Provide `--from-start` as a session-wide file Input option, default false. No persistent cursor or resume state is stored between sessions.
- Reuse declarative Record Preset loading, validation and precedence. File Input options are `paths` (a nonempty list of nonempty path strings) and `fromStart` (boolean). Explicit CLI paths replace the preset list; explicit CLI options override preset values, then defaults apply. Reject unknown options and malformed configuration before starting capture. No new builtin preset is required.
- For a file present at initial attachment, start at its current EOF unless from-start is enabled. If EOF is inside an existing unterminated line, discard that existing line's subsequent continuation through its next newline. A file ending in a newline does not cause the next appended complete line to be skipped.
- Missing paths are a waiting state, including at initial startup. A file first appearing after the initial missing-path observation is read from byte zero regardless of from-start. Replacement files and detected truncation also restart at zero.
- Follow the configured path rather than indefinitely following a renamed file. On a detected replacement or truncation, emit any valid retained unfinished line as partial before resetting framing and decoding state. Do not concatenate retained bytes with the new generation. Bytes not read before removal or truncation are subject to the stated best-effort limitation.
- Frame lines using LF, consuming a preceding CR as part of a CRLF terminator. Exclude terminators from recorded text, preserve blank lines, and do not emit a phantom empty fragment after a trailing newline. Preserve other text without trimming, parsing or redaction.
- Decode UTF-8 strictly and incrementally. A character split across writes is not invalid while more bytes may arrive. Invalid sequences fail the session; a still-incomplete sequence at a final shutdown or generation boundary is invalid rather than silently replaced.
- Each event contains the source path, raw decoded line text, and a partial marker. Complete newline-terminated lines are not partial; a nonempty unfinished line emitted at shutdown, replacement or detected truncation has `partial: true`. Keep ordinary Recorder envelope version, sequence, timestamps and elapsed-time semantics; no source-log timestamp parsing or backdating. Exact event field spelling beyond the agreed `partial` marker should follow existing Input event conventions and be documented with implementation.
- Enforce a fixed maximum of 1 MiB (1,048,576 bytes) of source line content, excluding LF/CRLF terminators, before decoding. The exact boundary is accepted; exceeding it is fatal even without a newline. Do not silently truncate oversized lines. Skipping an existing pre-session line must not require buffering it.
- An existing directory or a path that cannot be read is fatal. A missing path alone is not fatal. Report actionable path-specific failures. Recorder enqueue rejection and asynchronous Writer failure must propagate through the existing fatal-error lifecycle, stop capture, and produce unsuccessful exit status.
- On graceful stop, freeze a finite read boundary using the observed byte size of each attached file at stop initiation, stop discovering new files/generations, drain only through those boundaries, emit retained valid fragments, and then let the CLI close Recorder. Paths still missing at stop do not delay shutdown. Filesystem changes that make captured bytes unavailable remain best-effort; genuine read failures must not be hidden.
- Preserve the existing shared shutdown timeout and forced-stop behavior. File Input must release resources on successful stop, fatal failure, failed startup and forced termination. It must not close the shared Recorder itself.
- Ensure capture readiness is externally observable before a caller appends test or production data; readiness includes establishing the initial positions or missing-path waiting state. Report the Recording output using the existing session mechanism without implying a network listener is required.
- Existing output creation and default output naming remain unchanged. No Recording schema migration or Player-specific rendering is required.
- Implementation must document CLI usage, preset options, event payload, raw-secret exposure, limits and best-effort behavior in existing user documentation.

## Testing Decisions

- User confirmed the primary seam: invoke the actual built CLI, mutate real temporary files, stop through real process signals, then inspect the resulting Recording with the existing Recording parser and assert exit status and diagnostics. Test externally visible behavior, not internal watcher callbacks, polling choices, filesystem API calls or source-code structure.
- Reuse the existing CLI subprocess/readiness/cleanup style and HTTP capture integration-test conventions. Use isolated temporary directories and bounded waits with useful process diagnostics; do not rely on arbitrary sleeps to assert that capture is ready.
- Required permanent integration-test location: `packages/cli/src/cli.test.ts`. Add a file Input record-to-view scenario alongside the HTTP workflow: start the built CLI with a real temporary log, append known complete lines and an unfinished line after readiness, stop with SIGINT, assert parsed text/path/partial and successful exit, then invoke view and verify the served Recording matches the captured bytes and parsed events. This must be executable behavior coverage, not only a smoke instruction or a separate Input test suite.
- Verify default EOF behavior, from-start behavior, multiple paths, missing-then-created files, per-event path attribution, no cross-session cursor, and starting at an existing partial line.
- Verify LF, CRLF, blank lines, literal JSON text, preserved whitespace, UTF-8 characters spanning writes, invalid UTF-8, and incomplete UTF-8 at a final boundary. Assert actual retained text, not merely event counts.
- Verify waiting for newline, partial flush on graceful stop, partial separation at replacement and detected truncation, and no synthetic empty event after a terminal newline.
- Exercise path replacement, disappearance/reappearance and observable truncation with controlled fixture operations. Do not claim tests prove capture of bytes destroyed before the Input can read them.
- Verify exactly 1 MiB is accepted and the next content byte is fatal, including an unterminated oversized line. Check that no truncated substitute event is presented as successful capture.
- Verify directory and permission/read failures terminate unsuccessfully, while absent files remain waitable. Use a platform-appropriate deterministic unreadable-file scenario rather than assuming permission bits restrict privileged test users.
- Verify graceful stop drains to its captured boundary, includes valid partial text, does not wait for future file creation, and does not chase continued writes forever. Cover deadline failure with a controlled scenario using existing lifecycle facilities.
- Use the existing Recorder factory injection seam in recording failure tests only for deterministic queue rejection and asynchronous Writer failure. Keep a real Recorder with controlled Writer or queue capacity, as existing tests do; assert session termination and resource shutdown rather than mock forwarding.
- Verify file Input Record Preset configuration, CLI replacement/override precedence, and invalid configuration without adding a separate configuration system.
- Retain HTTP behavior coverage. Demonstrate a produced file Recording works through the existing record-to-view flow without adding Player-specific parsing or duplicating the entire Player test suite.
- During implementation, run an actual CLI smoke scenario in addition to permanent tests: append representative lines, perform a controlled file replacement, stop, and inspect the parsed Recording. This specification task does not implement or execute that feature.

## Out of Scope

- Generic filesystem create/change/delete event recording.
- Glob expansion, recursive directory discovery, or dynamically selecting new paths.
- JSON parsing, custom transforms, semantic log formats, multiline stack-trace grouping or source timestamp extraction.
- Secret detection or automatic content redaction.
- Binary logs or text encodings other than strict UTF-8.
- Persistent offsets, resume checkpoints, lossless audit guarantees or deduplication across sessions.
- Guaranteed recovery of bytes removed before they can be read, or a claim to observe every rapid truncate/rotation cycle.
- Globally correct occurrence-time ordering across files.
- New plugin loading, executable configuration, builtin presets, or changes to HTTP capture behavior.
- Replay, new Player UI, Recording envelope changes or SDK public API expansion.
- Implementing the feature as part of publishing this specification.

## Further Notes

- The user approved the behavior through the grilling conversation and confirmed the testing seams during specification preparation.
- Log text and paths may contain sensitive data. File Input is intentionally transparent and does not inherit HTTP header redaction semantics.
- Best-effort is a visibility limit of following files, not permission to suppress observed errors or knowingly drop accepted lines. Queue overflow, invalid encoding and excessive line size remain explicit failures.
- Watch versus polling mechanics and internal reader decomposition are implementation choices, provided the agreed behavior and bounded resource use hold. No new domain glossary term or ADR is required: this is a concrete Input using existing vocabulary, not a new domain concept.
