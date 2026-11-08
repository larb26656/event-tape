# HTTP Handler readability and validation refactor

Status: ready-for-agent

## Problem Statement

ผู้ดูแลอ่านและแก้ HTTP Handler ได้ยาก เพราะการตรวจ options, body capture, headers, proxy streaming และ server lifecycle อยู่รวมกัน การทดสอบแต่ละ path ควรค้นหาได้ใกล้ implementation โดยไม่ผูก test กับรายละเอียดภายใน

## Solution

จัด HTTP Handler เป็นโฟลเดอร์แยกความรับผิดชอบ ใช้ Zod สำหรับตรวจ options และจัด tests ตาม path ในโฟลเดอร์ Handler โดยรักษา CLI และพฤติกรรมการบันทึกเดิมทั้งหมด

## User Stories

1. As a maintainer, I want HTTP options validation grouped together, so that configuration rules are easy to find.
2. As a maintainer, I want a declarative schema, so that types, defaults and invalid values are understandable together.
3. As a Handler developer, I want one resolve method, so that callers cannot accidentally start with unvalidated options.
4. As a CLI user, I want explicit CLI values to override presets, so that saved configurations remain reusable.
5. As a CLI user, I want explicit false values respected, so that I can disable redaction deliberately.
6. As a CLI user, I want invalid configuration rejected before side effects, so that mistakes do not create recordings or listeners.
7. As a CLI user, I want unknown fields rejected with useful errors, so that configuration mistakes are actionable.
8. As a proxy user, I want upstream requirements unchanged, so that capture and proxy remain unambiguous.
9. As a maintainer, I want body capture separate from forwarding, so that capture limits are easier to understand.
10. As a maintainer, I want header handling grouped together, so that forwarding and redaction rules are easier to inspect.
11. As a maintainer, I want proxy lifecycle localized, so that streaming and errors are easier to follow.
12. As a maintainer, I want server and session lifecycle clear, so that shutdown remains safe.
13. As a recording user, I want body limits, encodings and redaction unchanged, so that recordings retain their established meaning.
14. As a proxy user, I want streaming and backpressure preserved, so that traffic is forwarded without unnecessary buffering.
15. As a CLI user, I want timeout and shutdown behavior preserved, so that active sessions remain reliable.
16. As a maintainer, I want tests for each path near the HTTP Handler, so that relevant coverage is easy to locate.
17. As a maintainer, I want tests to exercise observable behavior, so that internal refactoring does not break them unnecessarily.
18. As a maintainer, I want existing coverage retained without duplication, so that regressions remain detectable.

## Implementation Decisions

- Separate HTTP Handler responsibilities into cohesive modules for options, body capture, headers, proxying and Handler/server lifecycle. Keep related state together if splitting it would obscure lifecycle invariants.
- Keep the existing Handler interface and its single resolve method: it combines configuration, validates it and returns validated options or throws. Do not add a separate validate method.
- Use Zod as an explicit CLI runtime dependency; do not depend on its incidental transitive presence.
- Preserve explicit CLI overrides over preset options over Handler defaults, including explicit false. Reject unknown fields and invalid numeric forms.
- Preserve the capture/proxy upstream constraints and actionable field-specific errors. Validate before output creation or listening.
- Preserve public CLI options, Recording format, redaction, bounded capture, forwarding, streaming, backpressure, idle timeout, failure and shutdown semantics. Do not introduce a new HTTP framework or change SDK behavior.
- Place tests for HTTP paths in the HTTP Handler folder. Keep session-wide failure tests near session orchestration when they are not specific to HTTP. Relocate existing tests rather than duplicate their behavior.

## Testing Decisions

- The user confirmed the actual CLI as the primary test seam. Exercise real HTTP and observable responses, Recording contents and session termination rather than private helpers, implementation wiring or source layout.
- Separate tests by direct capture, proxy and options/presets while keeping them in the HTTP Handler folder. Retain and extend existing CLI, HTTP, proxy and failure tests as prior art.
- Cover valid and invalid options, unknown fields, precedence including false, numeric boundaries and rejection before filesystem/listener side effects.
- Preserve behavioral coverage for body limits and encoding, redaction, streaming, backpressure, upstream failures, timeouts, aborts, recording failures and shutdown. Avoid duplicate cases and tests asserting incidental wording.
- Run relevant tests, typecheck and lint, plus a real CLI HTTP smoke after the refactor.

## Out of Scope

- New Handler types, public plugins, new CLI capabilities or Recording schema changes.
- Replacing Node HTTP with a framework, redesigning the Player or changing SDK semantics.
- Introducing a separate validate method or exposing internal helpers solely for tests.

## Further Notes

This is a behavior-preserving maintainability refactor of the existing CLI recording feature. The test location does not require testing internal modules directly.
