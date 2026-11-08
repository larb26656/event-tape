# 02: Share Recording loading across acquisition paths

**Parent spec:** [Separate Viewer UI and CLI responsibilities](../spec.md)

**What to build:** Separate Recording acquisition from Viewer presentation. Route the initial HTTP Recording and file-picker selections through a shared Worker parsing and result-handling path, preserving the existing Viewer experience and enabling future hosts without implementing a desktop adapter.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] CLI-supplied Recordings and file-picker selections display their filenames and use the same Worker parsing rules, including truncated-tail recovery and line-numbered errors.
- [x] Loading, valid empty, warning and error states remain distinguishable; selecting a new Recording replaces the previous one and resets Playback as before.
- [x] A later selection remains active if an earlier asynchronous load completes afterwards; the deterministic shared-loading regression covers this race.
- [x] The file picker works independently and the browser development flow works without a CLI-supplied Recording; no desktop bridge is required.
- [x] Playback, event inspection, search and timeline behavior remain intact; parsing stays in the Worker, with the existing recording format and Playback store unchanged.
- [x] Exercised the changed loading paths in a browser and ran relevant tests and checks.

## Answer

Implemented on `integration/ui-cli-separation-clean` (`9348989`). Shared acquisition now routes HTTP and file input through the same Worker/result path. Viewer tests (9), recording-format tests (8), typecheck/build, and browser replacement, empty, truncated-tail, damaged-file, development-empty, and stale-load scenarios passed.
