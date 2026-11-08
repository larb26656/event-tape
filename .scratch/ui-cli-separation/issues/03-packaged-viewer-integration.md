# 03: Verify the packaged Viewer workflow end to end

**Parent spec:** [Separate Viewer UI and CLI responsibilities](../spec.md)

**What to build:** Prove that the combined CLI, local server, packaged Viewer and shared Worker loading path deliver the complete browser workflow after installation outside the monorepo. Fix any integration failures found without adding test-only interfaces or an automation suite solely for this ticket.

**Blocked by:** 01: Separate CLI and local server; 02: Share Recording loading across acquisition paths.

**Status:** resolved

- [x] Built and packed the Viewer, installed it outside the monorepo, and used its CLI to serve its own UI and Worker assets and display a real Recording.
- [x] Exercised both CLI invocation forms and `--no-browser`; help/version and invalid invocations exited appropriately without starting a server or opening a browser.
- [x] In an actual browser, replaced a CLI-supplied Recording through the file picker and verified the visible filename, event payloads, timeline and Playback belong to the replacement.
- [x] Exercised empty input, recoverable truncated-tail recovery and a rejected damaged Recording; the stale-selection race is covered by the deterministic regression test.
- [x] Verified the no-initial-Recording development experience and independent file-picker flow; inspected browser diagnostics with no page errors or failed requests.
- [x] Ran relevant tests and build/type checks; the single-install distribution and Recorder SDK runtime requirement remain unchanged.

## Answer

Packed installation and browser acceptance completed in an external temporary project. The default CLI opener dispatch was separately checked with a PATH probe that captured its loopback URL; the Viewer was opened in a managed browser. The installed package served bundled HTML, JS, CSS, and Worker assets.
