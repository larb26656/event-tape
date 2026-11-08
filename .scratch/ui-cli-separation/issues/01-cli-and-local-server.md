# 01: Separate CLI and local server

**Parent spec:** [Separate Viewer UI and CLI responsibilities](../spec.md)

**What to build:** Preserve the existing single-install browser Viewer workflow while separating CLI argument handling and launch orchestration from local serving. Use Commander 15.1.0 for both existing invocation forms, without introducing new commands or flags beyond conventional help/version.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `event-tape view <recording.jsonl>` and `event-tape <recording.jsonl>` open the selected Recording, with browser launch by default; `--no-browser` prints the usable local URL without opening a browser.
- [x] Help and version reflect the Viewer package and exit without launching a server or browser; missing arguments, missing files and unknown options fail without launching either.
- [x] The server binds to loopback on an available port and serves only the selected Recording, its filename metadata and packaged Viewer assets, preserving the existing HTTP contract.
- [x] Viewer declares Node `>=22.12.0`; installation and development documentation reflect the requirement. The Recorder SDK runtime requirement remains unchanged.
- [x] The built distributable retains the CLI and assets together; relevant checks and command/error/information paths were exercised.

## Answer

Implemented and verified on `integration/ui-cli-separation-clean` (`9348989`). Viewer build/typecheck and tests passed. Both CLI forms, `--no-browser`, help/version, invalid invocations, loopback serving, selected Recording, metadata, and packaged assets were exercised. A controlled opener probe confirmed the default CLI path receives the URL; the packed Viewer loaded in a browser. SDK runtime remains `>=22`.
