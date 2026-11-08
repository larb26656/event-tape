# Separate Viewer UI and CLI responsibilities

Status: resolved

## Problem Statement

Viewer ปัจจุบันรวมการอ่าน CLI arguments, การ serve static assets และ Recording บน localhost และการเปิด browser ไว้ด้วยกัน ขณะเดียวกัน UI โหลด Recording เริ่มต้นจาก HTTP endpoints โดยตรง ทำให้ความรับผิดชอบของตัวเปิด Viewer กับการแสดง Recording ผูกกัน ผู้ใช้ต้องการคง browser workflow และนำ Viewer UI เดิมไปใช้กับ desktop ในอนาคต โดยไม่สร้าง UI สองชุดหรือเพิ่มโครงสร้างเกินความจำเป็น

## Solution

แยก CLI arguments, local server และ Viewer loading เป็น modules ภายใน package เดิม ใช้ Commander 15 แทนการอ่าน arguments เอง ย้าย HTTP loading ออกจาก UI หลัก และให้ Recording จาก HTTP กับ file picker เข้าสู่กระบวนการโหลดและ parse ร่วมกันผ่าน Web Worker เดิม ผู้ใช้ยังติดตั้งครั้งเดียวและเปิด Recording ด้วยคำสั่งเดิมได้ ไม่สร้าง desktop app ในงานนี้

## User Stories

1. As a Viewer user, I want to open a Recording with `event-tape view <file>`, so that my existing workflow continues to work.
2. As a Viewer user, I want to keep using `event-tape <file>`, so that the existing shorthand remains compatible.
3. As a Viewer user, I want the CLI to open my browser by default, so that I can inspect a Recording immediately.
4. As a Viewer user, I want `--no-browser` to serve the Viewer without launching a browser, so that I can open the displayed URL myself.
5. As a CLI user, I want generated help describing supported commands and options, so that I can discover correct usage.
6. As a CLI user, I want a version command, so that I can identify my installed Viewer version.
7. As a CLI user, I want invalid arguments to produce actionable errors and an unsuccessful exit, so that I can correct my invocation.
8. As a CLI user, I want help and version requests to finish without starting the server or opening a browser, so that informational commands have no launch side effects.
9. As a Viewer user, I want the Recording supplied to the CLI to appear with its filename, so that I know what I am inspecting.
10. As a Viewer user, I want to open another Recording using the file picker, so that I do not need to restart the CLI.
11. As a Viewer user, I want HTTP-loaded and locally selected Recordings to follow the same parsing rules, so that results do not depend on how I opened the file.
12. As a Viewer user, I want loading, empty, warning and error states to remain understandable, so that I can distinguish a valid empty Recording from a failed load.
13. As a Viewer user, I want existing truncated-tail recovery and line-numbered parse errors preserved, so that damaged Recordings are handled consistently.
14. As a Viewer user, I want a newly selected Recording to remain selected even if an earlier load finishes later, so that stale results do not replace my choice.
15. As a Viewer user, I want parsing to remain in a Web Worker, so that this refactor does not move parsing work onto the UI thread.
16. As a Viewer user, I want Playback, event inspection and search to retain their existing behavior, so that structural changes do not disrupt inspection.
17. As a user installing the Viewer, I want the CLI and web assets delivered together, so that I do not manage separate installations or versions.
18. As a local Viewer user, I want the server restricted to loopback and the selected Recording plus packaged assets, so that the refactor does not expand filesystem exposure.
19. As a future desktop maintainer, I want Recording acquisition separated from Viewer presentation, so that the same UI can later receive a Recording from another host.
20. As a Recorder SDK consumer, I want the SDK runtime requirement unchanged, so that adopting this Viewer refactor does not force an SDK runtime upgrade.

## Implementation Decisions

- Keep one existing Viewer package and distribution. Separate responsibilities with modules, not new workspace packages, separately installed artifacts or additional processes.
- CLI module owns Commander declarations, command dispatch, usage/error presentation and launch orchestration. Local-server module owns loopback hosting, selected Recording delivery and static asset delivery. Viewer loading owns acquisition-to-Worker coordination rather than embedding HTTP requests in the main presentation module.
- Use Commander 15; the researched compatible candidate is 15.1.0. Declare Viewer CLI minimum Node `>=22.12.0`, consistent with the published Commander engine requirement. Do not change the Recorder SDK minimum. Align Viewer requirements and development/install documentation with the declared floor.
- Preserve `event-tape view <recording.jsonl>`, `event-tape <recording.jsonl>` and `--no-browser`. Add conventional Commander help/version; version reflects the Viewer package version. Do not add unrelated commands or flags.
- Both supported invocation forms use the same launch behavior. Help/version and invalid invocations must not launch the server or browser. Missing arguments, unknown options and missing files report failure rather than pretending to launch successfully; do not pin exact error wording.
- Keep browser opening as the default and preserve the printed local URL when browser opening is disabled. Continue binding the server to loopback and selecting an available port.
- Keep the current HTTP contract for the CLI-hosted Viewer: selected Recording content, filename metadata and bundled static assets. Do not expose arbitrary filesystem paths or add a general-purpose file server.
- Separate Recording acquisition from presentation at the loading seam. HTTP content and browser File input enter the same Worker parsing/result-handling path. Preserve the Recording name, loading/error/warning states, replacement semantics and protection against stale asynchronous results.
- Preserve the browser development flow without a CLI-supplied Recording and retain the independent file picker. Do not require a desktop bridge to run the browser Viewer.
- Reuse the existing recording-format parser and Playback store. Keep parsing in the Web Worker and browser clock handling outside the Playback logic. Do not change the Recording envelope schema or introduce a new shared core package.
- Desktop remains another future host for the same Viewer UI; do not implement a desktop adapter or assume a native bridge, asset protocol or desktop framework now.
- Update affected consumers, build/package integration and user documentation together while retaining the single-install CLI-plus-assets distribution.

## Testing Decisions

- Primary acceptance seam: launch the built, distributable CLI and exercise the actual browser Viewer. This is the highest existing consumer-facing seam and proves arguments, server, bundled assets, Worker and UI cooperate. Do not introduce test-only interfaces or mock forwarding tests.
- This reuses the design-approved CLI/browser flow and shared Recording loading seam; no additional user interview is required to reconfirm them. Existing parser and Playback interfaces remain narrower seams only for rules already owned there.
- A good permanent test checks externally observable outcomes, transitions, errors or race conditions. Do not test module names, source text, exact incidental error wording, Commander internals or copies of passed arguments.
- Exercise both command forms and `--no-browser`; observe the actual URL/server and verify a real Recording is displayed. Verify help/version and invalid invocations terminate with appropriate outcomes without starting a server or browser.
- Verify a packed installation outside the monorepo can serve its own UI and Worker assets and open a Recording. A workspace-only launch is insufficient proof of the packaging contract.
- In an actual browser, open a CLI-supplied Recording, then replace it through the file picker. Verify the visible filename, event payloads, timeline and Playback belong to the replacement Recording. Exercise empty input, a recoverable truncated tail and a rejected damaged Recording through the loading paths.
- Exercise an overlapping-load scenario where an earlier result arrives after a later selection; the later Recording must remain active. Add a deterministic regression test at the shared loading seam if needed to protect this uncertain asynchronous transition, rather than adding a generic host framework for testing.
- Preserve loading/error state transitions, Worker parsing, file-picker independence and the existing no-initial-Recording development experience. Observe browser console/network failures as part of smoke verification.
- Prior art: existing Vitest parser tests cover final-newline handling, truncated-tail recovery, invalid interior lines and unsupported envelope versions. Existing Vitest Playback tests cover elapsed time, pause/speed, timestamp ties, selection/seek, empty Recordings and replacement reset. Reuse those conventions and tests; do not duplicate their rules in CLI/UI tests.
- Run the relevant existing tests and build/type checks after implementation. No new permanent browser automation suite is required; actual CLI/browser smoke remains required. Record only checks actually exercised.

## Out of Scope

- Building a desktop application or choosing Electron, Tauri or another desktop runtime.
- Desktop adapters, native file dialogs, OS file associations, persistent native recent-file history or native bridges.
- Splitting workspace packages, separate UI installation, new public libraries or a generic shared core.
- Headless Recording analysis, script/CI commands, plugin systems, shell completion and standalone CLI installers.
- New Recording formats, parser/recovery rules, Playback semantics or Replay. Playback remains view-only and does not send events into another system.
- Viewer visual redesign, Recorder SDK changes, unrelated server/security features or additional CLI flags.

## Further Notes

- The user confirmed shared browser/desktop UI, launcher-only CLI scope, module-level separation within the current package, Commander 15 with Viewer-only Node floor change, the shared loading seam, compatibility and the final design on 2026-11-08.
- Framework comparison and primary-source citations: [CLI framework research](cli-framework-research.md). [Published Commander 15.1.0 metadata](https://registry.npmjs.org/commander/15.1.0) declares Node `>=22.12.0`.
- Earlier investigation launched the existing built CLI with a sample Recording and `--no-browser`; metadata returned HTTP 200 with the expected filename. The server was stopped. This is baseline evidence only, not verification of the proposed refactor, Commander integration or desktop support.
- This document supersedes the earlier design notes at this tracker location. It is ready for implementation planning/execution; publishing it does not mean implementation has already happened.
- No new glossary terms or ADR are needed: UI/CLI/host are generic implementation terms, and this change does not commit to a new distribution model or desktop runtime.

## Comments

- 2026-11-08: Design interview completed; user confirmed the complete design without starting implementation.
- 2026-11-08: Synthesized into the requested specification format and published to the local issue tracker with Status: ready-for-agent.

- 2026-11-08: Implementation completed on `integration/ui-cli-separation-clean`; tickets 01-03 resolved after build, test, packed-install and browser verification.
