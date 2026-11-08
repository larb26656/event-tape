# Separate CLI and Player packages and record HTTP traffic

Status: ready-for-agent

## Problem Statement

Event Tape รวม executable, local server และ Player UI อยู่ในแพ็กเกจเดียว ผู้ใช้กำลังเพิ่มการบันทึกผ่าน CLI ซึ่งไม่ได้เป็นหน้าที่ของ Player และไม่ต้องการให้ขารับข้อมูลหรือการส่งต่อ traffic ผูกกับ UI

ผู้ใช้ต้องการเปิดตัวรับ HTTP ทิ้งไว้เพื่อสร้าง Recording หรือคั่นระหว่างแอปกับบริการเดิมเพื่อส่งต่อพร้อมบันทึก request/response ต้องตั้งค่าได้ง่ายผ่าน Record Preset และยังเรียก Handler โดยตรงได้ การเพิ่มแหล่งข้อมูลภายหลังต้องไม่สร้าง recording core ใหม่หรือบังคับว่าทุก Handler เป็น HTTP server

## Solution

แยก `@event-tape/cli` และ `@event-tape/player` เป็นคนละแพ็กเกจ CLI เป็นเจ้าของ executable `event-tape`, คำสั่ง `view`/`record`, local server และ browser launch; Player ส่งมอบเว็บแอปที่ build แล้ว ติดตั้ง CLI ครั้งเดียวก็เปิด Recording แบบ offline ได้

เพิ่ม Handler interface ภายในโค้ด CLI สำหรับลงทะเบียนชื่อ, schema, lifecycle และการแจ้ง fatal error เริ่มด้วย HTTP Handler ที่รับตรงหรือ proxy ไปยัง upstream โดยใช้ Recorder/Writer เดิม บันทึก request/response แยก event เชื่อมด้วย requestId จำกัด body ที่เก็บ ปิดบัง headers สำคัญ และปิด session แบบ graceful เมื่อรับต่อหรือบันทึกต่ออย่างปลอดภัยไม่ได้

ผู้ใช้เลือก builtin Record Preset หรือเขียน plain YAML เองได้ โดย Handler เป็นเจ้าของ schema ของ options และ CLI options ที่ระบุชัดเจน override ค่า preset ได้ Builtin `otel` เป็น HTTP proxy preset สำหรับคั่นก่อน collector ที่ผู้ใช้ระบุ ไม่ใช่ collector หรือ semantic OTel decoder

## User Stories

1. As a CLI user, I want CLI and Player to be separate packages, so that recording features do not belong to the UI package.
2. As a CLI user, I want one CLI installation to include a compatible Player, so that I do not install or match their versions manually.
3. As a CLI user, I want the installed CLI to open recordings without a network connection, so that local inspection does not depend on a CDN.
4. As a Player user, I want the existing view command to keep working, so that package separation does not disrupt inspection.
5. As a Player user, I want the existing filename shorthand to keep working, so that my current launch workflow remains usable.
6. As a Player user, I want browser launch and no-browser operation preserved, so that I can choose how to access the local Player.
7. As a CLI user, I want help and version commands to work without starting servers or creating recordings, so that informational commands have no recording side effects.
8. As a developer, I want the Player package to contain its built UI and Worker assets, so that the CLI can serve a complete installed application outside the checkout.
9. As a developer, I want to register a Handler through a common internal interface, so that I can add a source without changing Recorder or generic command orchestration.
10. As a Handler developer, I want to own my options schema, so that each source can accept only settings that have meaning for it.
11. As a Handler developer, I want validated options and an existing Recorder at startup, so that I do not duplicate validation or recording infrastructure.
12. As a Handler developer, I want a stop contract and a fatal-error channel, so that CLI session ownership remains consistent after startup.
13. As a CLI user, I want to select the HTTP Handler directly, so that I can record without creating a preset.
14. As a CLI user, I want to record incoming HTTP requests without an upstream, so that applications can send traffic directly to Event Tape.
15. As a direct-capture client, I want a 204 response after my body is consumed and the event is accepted by Recorder, so that the acknowledgement has a clear meaning.
16. As a direct-capture user, I want acknowledgement distinguished from durable disk persistence, so that I do not mistake buffered data for a completed write.
17. As a CLI user, I want to proxy traffic to a chosen HTTP or HTTPS upstream, so that I can observe an existing service without changing its implementation.
18. As a proxy user, I want incoming method, path and query preserved, so that requests do not have to target a special recording endpoint.
19. As a proxy client, I want upstream response status, headers and body forwarded with their HTTP meaning preserved, so that recording does not intentionally change application behaviour.
20. As a proxy user, I want redirects passed back rather than followed by the recorder, so that the application remains responsible for redirect handling.
21. As a proxy user, I want no automatic request retries, so that capture does not cause duplicate application operations.
22. As a proxy user, I want request and response bodies forwarded incrementally, so that large uploads and streaming responses do not wait for whole-body buffering.
23. As a proxy user, I want backpressure respected, so that a slow peer does not create an unbounded forwarding buffer.
24. As a recording reader, I want request and response as separate events with a shared requestId, so that I can associate both directions of an exchange.
25. As a recording reader, I want request method, URL, headers and body captured, so that I can inspect what the application sent.
26. As a recording reader, I want response status, headers and body captured, so that I can inspect what the service returned.
27. As a recording reader, I want HTTP start time retained even when the event is emitted later, so that I can distinguish network timing from Recorder enqueue timing.
28. As a recording reader, I want incomplete traffic distinguished from complete traffic, so that a cut connection does not look like a valid complete exchange.
29. As a CLI user, I want body capture to accept JSON, text and binary, so that generic HTTP capture does not require an application payload schema.
30. As a recording reader, I want the stored body encoding identified, so that binary is not mistaken for readable text.
31. As a CLI user, I want a default limit of 64 KiB per captured body, so that large payloads or images do not fill recordings unnecessarily.
32. As a CLI user, I want that limit configurable, so that I can choose the capture detail needed for a session.
33. As a recording reader, I want truncation and retained byte count explicit, so that a prefix is never presented as the complete body.
34. As a proxy client, I want capture truncation not to truncate forwarded traffic, so that recording limits do not corrupt uploads or responses.
35. As a CLI user, I want Authorization, Cookie and Set-Cookie hidden in recordings by default, so that common credentials are not recorded accidentally.
36. As a CLI user, I want header redaction enabled or disabled explicitly and additional blocked names configurable, so that I can choose the inspection policy for my environment.
37. As a proxy client, I want capture redaction not to modify forwarded credentials, so that the original service can still authenticate requests.
38. As a CLI user, I want to select a built-in preset by name, so that common recording setups are easy to reuse.
39. As a CLI user, I want to supply my own declarative YAML preset, so that I can save a setup without writing a Handler.
40. As a CLI user, I want built-in preset selection and preset-file selection to be distinct and mutually exclusive, so that their meaning and precedence are unambiguous.
41. As a CLI user, I want explicit CLI options to override preset values and then fall back to Handler defaults, so that a saved setup remains reusable.
42. As a CLI user, I want invalid YAML structure, unknown Handlers and invalid options rejected before recording starts, so that configuration mistakes do not leave a running partial session.
43. As a CLI user, I want validation errors to identify the field and reason, so that I can repair a configuration without guessing.
44. As an OTel user, I want a proxy preset that requires my collector upstream, so that I can capture traffic going to my existing collector.
45. As an OTel user, I want the tool to distinguish HTTP traffic capture from collector support or semantic decoding, so that its compatibility claims are accurate.
46. As a CLI user, I want presets independent of output filenames, so that repeated sessions can reuse the same input configuration.
47. As a CLI user, I want an automatic timestamp-and-random-word filename below the current working directory when output is omitted, so that a session can start without naming a file.
48. As a CLI user, I want an explicit output path used as supplied, so that I control where a recording is written.
49. As a CLI user, I want missing parent directories created, so that I do not prepare them manually for every session.
50. As a CLI user, I want existing files protected from overwrite and append, so that a recording command cannot silently destroy or mix earlier sessions.
51. As a CLI user, I want loopback-only listening by default and an explicit address for other interfaces, so that local capture is not exposed to the network unintentionally.
52. As a streaming user, I want an adjustable 30-second idle timeout rather than a total stream lifetime limit, so that active long-lived streams can continue.
53. As a proxy client, I want an unavailable upstream reported as 502 or an upstream timeout as 504 where possible, so that failures are visible to the caller.
54. As a recording reader, I want upstream failures associated with requestId while the session remains usable, so that I can investigate intermittent service errors.
55. As a CLI user, I want disk errors or unsafe recording overload to stop the session visibly rather than drop events silently, so that an apparently healthy capture is not misleading.
56. As a CLI user, I want graceful shutdown on interruption or recording failure, so that pending traffic and queued writes have a bounded chance to finish.
57. As a CLI user, I want a configurable 10-second total shutdown deadline, so that stopping the command cannot hang indefinitely.
58. As a CLI user, I want abnormal termination and incomplete work reported clearly, so that an unsuccessful session is not mistaken for a complete recording.
59. As a Player user, I want recordings from the new command to open through existing parsing and inspection, so that recording does not require a separate viewer or a format migration.
60. As a maintainer, I want installed CLI, real HTTP traffic, actual recording files and the real Player exercised together, so that package-local success is not mistaken for a usable distribution.

## Implementation Decisions

### Package ownership and clean cutover

- Create `@event-tape/cli` as the owner of the `event-tape` executable, command parsing, browser opening, view hosting and recording-session orchestration. `@event-tape/player` owns the browser application and all its built assets, including the Worker. The Player is not a public React component library.
- CLI depends on an exact compatible Player version as a runtime dependency; Player does not depend on CLI. The installed CLI discovers the Player asset root through an explicit package contract, not source-layout assumptions or the caller's working directory.
- Build and package Player assets before verifying the installable CLI. Include every asset necessary to inspect a Recording offline; do not fetch UI assets from a CDN.
- Move the executable and CLI/server responsibilities completely out of Player. Update workspace commands, distribution metadata, build dependencies, installation guidance and all affected callers together. Do not retain a second executable or compatibility shim inside Player.
- Preserve `event-tape view`, the existing filename shorthand, browser-by-default behaviour, no-browser behaviour, conventional help/version and error handling. Informational or invalid commands must not start a server or create a Recording.
- Preserve browser development, file-picker loading, Worker parsing, Playback, search and raw event inspection. Package separation is not a UI redesign.
- Keep the current CLI runtime floor of Node.js >=22.12.0; do not change SDK consumers' runtime requirements as a side effect.

### Recorder reuse and Handler interface

- Use existing Recorder, Writer, bounded write pipeline and Recording envelope version 1. The CLI creates and owns one Recorder per recording session. Do not build a second recording core or protocol-specific writer pipeline.
- Register Handlers in CLI code behind a common internal interface: stable selector name, options schema/defaults, asynchronous start using resolved options and the CLI-owned Recorder, graceful stop, and reporting of fatal errors after start succeeds. Concrete type/method spelling remains an implementation detail.
- Generic orchestration must not depend on HTTP routes, upstreams, sockets or file-watching details. A future Handler need not open a server or support proxy mode.
- Adding a Handler consists of implementing that interface and registering it. User YAML selects a registered Handler; it does not load JavaScript, npm plugins or arbitrary executable configuration.
- CLI coordinates shutdown. A Handler stops new input and settles its pending work before CLI closes Recorder. Handlers do not close the shared Recorder themselves. Startup failures also release any resources already acquired.
- Preserve Recorder's current enqueue-time timestamp, monotonically assigned sequence and elapsed-time semantics. Put HTTP requestId, direction/kind, actual start time, completion/error information and capture metadata in JSON-safe Handler event data; do not backdate or patch Recorder envelopes.

### Command configuration and Record Presets

- Add `record` to the same executable. It supports direct Handler selection, a built-in preset selected with `--preset`, or user YAML selected with `--preset-file`. Built-in-name and file selection are mutually exclusive. Do not guess whether one string is a name or a path, and do not merge two preset sources.
- Plain YAML contains `handler` as the selector and `options` as that Handler's configuration. No preset inheritance, `extends`, expressions, executable transforms or embedded Handler code.
- Record Preset chooses and configures an existing Handler; it does not define what an event means or how a payload is transformed. Each Handler owns those behaviours and its options schema.
- Resolve values using explicit CLI settings first, then preset settings, then defaults of the selected Handler. Parser-generated CLI defaults must not accidentally override preset values. Apply precedence to individual options rather than replacing all Handler options with a partial override.
- Validate the preset structure and resolve its registered Handler before applying its schema. Validate final options after precedence/default resolution, including required fields and allowed combinations. Use the same validation for direct Handler selection and presets.
- Unknown Handler, unknown fields, unsupported mode/options, invalid types and missing proxy upstream are actionable errors. Report the relevant field/reason and exit unsuccessfully before creating the Recording, listening or connecting to upstream.
- HTTP configuration includes mode, listen address, upstream when proxying, captured-body byte limit, header-redaction policy and idle timeout. Graceful-shutdown deadline belongs to CLI session orchestration. Other Handlers need not accept these HTTP-specific fields.
- Direct HTTP capture and proxy are explicit modes; do not infer proxying merely because an arbitrary client sends an absolute URL. The configured upstream is the forwarding destination, not a client-controlled open-proxy target.
- Built-in `otel` selects HTTP proxy mode. Users supply their own upstream; do not ship a collector destination. This is capture of HTTP requests/responses, not an OTel collector, OTLP/gRPC server or semantic telemetry decoder. A direct HTTP capture response is generic rather than an OTel-specific acknowledgement.
- Exact spelling of as-yet-unagreed flags and schema fields other than the accepted selectors and YAML top-level fields is an implementation detail. Document the resulting public command/options consistently; do not invent a second configuration language.

### Recording output and session startup

- Output is a per-invocation CLI setting, never a field in Record Preset. If supplied, treat it as the target file rather than appending an automatically chosen name. Resolve relative output against the invocation's working directory.
- Without an explicit target, create `.tape/{timestamp}-{random_word}.jsonl` beneath the current working directory. Use sortable UTC timestamp text without colons. The exact timestamp precision and random-word vocabulary are implementation details.
- Create missing parent directories automatically. Explicit existing targets cause an error: no overwrite and no append. Automatically generated name collisions cause a new name to be selected.
- Enforce exclusive creation atomically rather than checking existence and later opening destructively. Reuse the existing File Writer, which already creates parents and opens exclusively. Retry only automatic-name collisions, not permission errors or unrelated failures.
- Announce the actual listening address and Recording destination once startup succeeds, so the caller can route traffic and find the file. Do not claim readiness after a failed bind or writer initialization.

### HTTP receiving and forwarding

- First delivery supports an HTTP/1.1 listener. Default bind address is 127.0.0.1; accepting another interface requires an explicit listen address. It is a local/dev tool, not a public multi-tenant ingestion service.
- Accept ordinary HTTP requests for all paths and methods rather than requiring a special recording route. Protocol upgrade or tunnel methods that require functionality outside plain HTTP forwarding must not be advertised as WebSocket, CONNECT tunnelling or HTTPS interception support.
- Prefer the existing native Node.js HTTP approach and protocol-specific libraries only where required. No Hono dependency or generic framework layer is needed for the agreed HTTP feature; keep that internal choice out of Recorder and the Handler interface.
- Capture mode has no upstream. Consume the incoming body while retaining only the permitted prefix, finalize its event and return 204 No Content only after Recorder accepts it. Acceptance does not mean durable disk persistence. Do not invent an upstream response event in this mode.
- Proxy mode sends to a configured HTTP or HTTPS upstream and preserves incoming method, path and query without application-level rewriting. Forward response status and headers/body with their HTTP semantics preserved. Handle transport-specific headers and upstream Host/TLS routing correctly rather than promising byte-identical HTTP framing.
- Preserve repeated-header semantics where significant; in particular, do not collapse independent Set-Cookie values into a different value. Capture redaction must never alter forwarded credentials or payload.
- Pass 3xx responses back to the client; never follow redirects on its behalf. Do not automatically retry requests.
- Forward request and response bodies incrementally and respect backpressure in both directions. Do not buffer entire traffic bodies to enable recording. A large payload must reach upstream/client intact even after the capture prefix limit is reached.
- Use an adjustable 30-second idle timeout, not a total request/stream lifetime limit. Active long-lived streams continue; inactive operations eventually terminate. Idle handling must cover waiting operations as well as active bodies and must not mistake downstream backpressure for permission to accumulate unlimited data.
- Upstream connection failure produces a 502 response when response headers have not been committed; upstream timeout similarly produces 504. Record error information correlated with requestId, while leaving the session available for subsequent requests.
- Once downstream response headers/body have begun, do not pretend to replace the response with a new status. End the affected connection and record its incomplete/error state. Client disconnect cancels needless upstream work and finalizes captured partial information rather than leaving an orphan operation.

### HTTP event content, timing and bounded capture

- Proxy request and response are distinct events connected by a session-unique requestId. Do not manufacture a successful response for an exchange that failed before one existed; correlate the error with that requestId instead.
- Request data includes method, URL, headers and captured body. Response data includes status, headers and captured body. Retain the relevant start time and completion/incomplete status of each side in event data.
- Emit each side's event when its body completes or that side is cut short. Preserve start time even though emission happens later. No event patching, provisional events or chunk-per-event protocol is required.
- File/envelope order remains Recorder acceptance order, not guaranteed request-start order. Concurrent requests or early responses can complete in a different order; consumers use requestId and retained times to interpret them.
- A still-open stream has no completed event for that side. A process crash can lose that event even if some traffic was already forwarded. This is an accepted limitation; do not advertise crash-complete capture or streaming live inspection.
- Handle JSON, text and binary without application-domain payload validation. Use text only when bytes can be represented without loss; otherwise use base64 and record the encoding. Do not require a complete JSON document or parse arbitrary JSON into domain events.
- Default retained body limit is 64 KiB, independently for each request and response body, configurable through HTTP options. Count bytes before base64 expansion, not characters or final JSONL length. Retain only a prefix while reading, never load the entire body then truncate it.
- Identify truncation explicitly with `truncated` and retained byte count. An incomplete connection is distinct from exceeding the capture limit. A body exactly at the limit is not truncated unless more bytes actually existed. Zero-body requests/responses remain valid without fabricated payload content.
- JSON and images cut by the limit are prefixes, not complete documents or decodable images. Do not append pretend closing syntax or claim the body was parsed successfully. Preserve bytes at text boundaries without introducing invalid-text replacement; base64 is available when a prefix cannot be represented losslessly.
- Capture truncation affects only the Recording copy. Do not apply it to forwarded bodies, lengths or client-visible response content.

### Header privacy

- Enable recording-side header redaction by default for Authorization, Cookie and Set-Cookie. Match names case-insensitively on both directions.
- Expose an enable/disable option and support additional blocked names. Additional names extend the default list rather than accidentally replacing it. When disabled, the user is explicitly choosing to retain header values.
- Remove or replace sensitive values before sending event data to Recorder. The redacted value must not survive in another captured header representation or error message. Preserve enough header-name information for inspection without storing the secret itself.
- Never mutate the original request or forwarded response to perform redaction. A proxy must still authenticate and pass cookies normally.
- Header redaction is not general sanitization. Body, URL/query and user-added custom fields may still contain secrets; explain this limitation in usage guidance. Arbitrary body redaction and schema-based filtering are not part of this delivery.

### Bounded resources, failures and shutdown

- Reuse Recorder's finite write queue and surface both synchronous record rejection and asynchronous writer errors through the session owner. Existing Recorder defaults to a 16 MiB accounted pending-write limit; this is not a claim of an equivalent bound on total process memory.
- Also bound active capture/forwarding buffers and in-flight work: a per-body prefix alone does not bound memory across unlimited concurrent requests. Do not add an unbounded secondary queue around Recorder.
- Determine concrete concurrency/aggregate-buffer limits from the existing implementation and exercised smoke scenarios; expose and document any user-facing knobs chosen. No arbitrary throughput promise is part of this spec.
- If traffic or writes cannot be accepted safely within finite limits, report the failure and begin graceful shutdown. Do not silently drop events or keep forwarding indefinitely while the user believes Recording is healthy. Do not introduce retries, fallback recording destinations or a lossy capture mode.
- Ctrl+C and fatal recording failures use graceful shutdown: stop accepting new requests, allow in-flight operations to finish where possible, finalize their events, then close Recorder and drain accepted writes.
- Default overall shutdown budget is 10 seconds, configurable. It covers in-flight work and Recorder close together, not a fresh full budget for each resource. At expiry, terminate remaining work and report that the recording/session may be incomplete.
- Idempotently coordinate simultaneous errors, stop requests and disconnects so resources are closed once and no new events are sent after Recorder closes. Do not wait forever for idle keep-alive sockets or never-ending upstream streams.
- Graceful user-requested completion exits successfully only if shutdown completed without recording failure. Configuration/startup/write failure or an expired shutdown deadline exits unsuccessfully with actionable diagnostics. A single handled upstream failure does not make the recording session fatal.

### Existing compatibility and documentation

- Keep Recording envelope version 1 and the existing JSONL parser/recovery behaviour. HTTP-specific fields live in payload; do not require an SDK schema migration or change ordinary SDK event behaviour.
- New recordings open in the existing Player event list/JSON inspector. No protocol-specific UI or new timeline semantics are required. Preserving actual HTTP start time in payload does not promise a new request-start-based Playback clock.
- Update user documentation for the new installation owner, existing view workflow, direct recording, HTTP proxying, built-in/user presets, precedence, output naming, privacy, truncation, limits and graceful shutdown.
- Replace obsolete instructions and package responsibility descriptions rather than keeping two competing ways to install the executable. Preserve historical issue/spec records as history, not as the current installation contract.

## Testing Decisions

### Agreed primary seam

The user confirmed one primary acceptance path: install the built CLI and its packaged Player outside the workspace, launch the actual executable, send real HTTP traffic through loopback clients and a real local fixture upstream, inspect the resulting JSONL, and open that Recording in the actual browser Player. Keep this as the highest practical seam rather than proving mock forwarding or registry wiring.

A local fixture upstream is a controlled real HTTP server, not a mock replacement for the Handler or Recorder. It can exercise chunked traffic, delays, aborts, redirects, repeated headers, unavailable endpoints and HTTP/HTTPS destinations. Tests and smoke runs do not need public services or a real telemetry account.

### Consumer-visible acceptance coverage

- Packed installation outside the checkout: CLI resolves Player assets/Worker, existing view and filename shorthand work, no-browser is usable, help/version do not create a file or listener, and UI inspection works with network asset fetching disabled. Observe the actual browser surface, not only a successful asset response.
- Direct capture: real methods/paths/body are accepted, the response is 204 only after successful Recorder acceptance, and the closed file parses as a valid version-1 Recording with the captured request. Verify through observable response/file behaviour, not a mock assertion that record was called.
- Proxy: the upstream sees unchanged method/path/query and complete body, while the client receives the upstream's status, meaningful repeated headers and complete response. Request/response events share requestId, including concurrent exchanges whose completion order differs.
- Privacy: original secrets reach the intended peer where applicable but do not appear in the default captured headers; mixed-case names and configured extra blocked names behave correctly. Explicit disable retains values as requested. Do not equate header-only redaction with absence of secrets from arbitrary body/query data.
- Capture limits: cover below, exactly at and above the byte limit, UTF-8 boundary cases and binary/base64. Assert retained bytes and truncation metadata while the forwarded body remains complete. This catches character-counting, base64-expansion and forward-path truncation bugs.
- Streaming: prove an initial chunk reaches the other peer before the sender finishes, then complete or abort the stream and inspect its finalized event. A slow receiver or many concurrent uploads must not cause unbounded retained-body or pending-write queues.
- Configuration: valid builtin and file presets, direct selection, missing/unknown Handler, unsupported keys/types, missing proxy upstream and mutually exclusive selectors. Exercise precedence with explicit overrides of existing values, including boolean false and absent CLI settings; reject invalid resolved options before output/listen side effects.
- Output safety: relative/absolute explicit targets, missing parents, automatic names under a temporary working directory, generated-name collision and an existing explicit target. Existing target bytes must stay untouched, including a concurrent-create race; do not merely assert that a path exists.
- Upstream errors: verify 502 for connection failure and 504 for timeout before response start, correlated Recording error data and successful handling of a subsequent request. After a response starts, verify incomplete termination instead of a fake replacement status.
- Redirect and retry behaviour: a redirect target is not contacted by the recorder, and a failing upstream observes no hidden duplicate request.
- Timeout: an otherwise active stream survives longer than the configured idle interval, whereas a genuinely idle operation ends. Use short configurable durations or controlled time where appropriate without changing the production semantics.
- Shutdown: with real in-flight traffic and accepted writes, interrupt the command and observe no new accepted work, finalized available events, Writer close and eventual process exit. Also cover a stalled stream and total deadline expiry; the budget must not restart at Recorder close.
- Recording failures/overload: exercise a deterministic Writer failure or bounded-queue rejection using the existing Writer/Recorder seam where real filesystem failure cannot be induced portably. Verify the actual session stop/error behaviour rather than forwarding mock-call counts. Do not fill the developer's disk as a test.
- Player: open a newly recorded file and inspect correlated HTTP events, redacted headers, encoding and truncated/incomplete metadata in the existing raw inspector. Preserve current malformed-tail recovery, invalid-envelope rejection, file-picker replacement and Playback behaviour.

### Test design and prior art

- Permanent tests must catch plausible consumer-visible failures in behaviour, boundaries, errors, transitions or precedence. Avoid source-text checks, incidental exact wording, object-copy tests, bare not-throw assertions and tests that only prove mocks echo arguments.
- Reuse the existing SDK Recorder-to-real-file integration pattern with isolated temporary directories and cleanup, the existing Writer contract for deterministic failure/pressure cases, and existing Recording parser tests for envelope/recovery rules. Do not duplicate already-covered parser/SDK contracts in every HTTP test.
- Existing Player loading tests cover stale HTTP/file-selection replacement; existing Playback tests cover time navigation. Keep those contracts intact rather than adding a protocol-specific UI test surface.
- Add focused lower-seam tests only for uncertain semantics such as schema/precedence, lifecycle races or byte-boundary capture when the installed-process path is too coarse. Generic Handler registry wiring does not deserve a mock-only test suite.
- During implementation run relevant behaviour tests, type checks, lint/build and the existing suite. Then perform installed CLI/HTTP/file/browser smoke verification and record only observed outcomes. Tests alone do not substitute for the actual user path.
- Finite queue sizes, connection limits and body-prefix behaviour need runtime evidence under an exercised slow-peer/concurrent scenario. State the limits of that evidence instead of presenting a smoke run as a throughput benchmark.

## Out of Scope

- Implementing code as part of this specification task; implementation follows approved implementation tickets.
- WebSocket, file watcher, log tailing or other new source Handlers in the first delivery. Their future existence motivates the non-HTTP-specific Handler interface only.
- External JavaScript/npm plugin loading, a published stable third-party Handler SDK or executable presets.
- Preset inheritance, templating, expressions, merge chains or loading multiple preset sources together.
- Receiving HTTPS, HTTP/2 support, HTTPS interception/MITM, CONNECT tunnelling and WebSocket upgrades. HTTPS upstream forwarding remains in scope.
- OTel collector behaviour, OTLP/gRPC ingestion, semantic protobuf/telemetry event decoding or OTel-specific direct-capture acknowledgements.
- Public multi-user ingestion, authentication infrastructure, tenant isolation, hosted dashboards or cloud recording storage.
- Live viewing, in-place event updates, chunk-level events or a guarantee that open/crashed streams have completed events on disk.
- Application traffic rewriting, response simulation, automatic redirects/retries or replaying recorded events into another system.
- Arbitrary body/query secret filtering, unbounded/full-body capture or a claim that default header redaction makes recordings safe to share.
- Player visual redesign, protocol-specific inspector UI, public React component exports, desktop applications or changing Playback to use HTTP start-time metadata.
- Recording envelope migration, altered Recorder timestamp/sequence semantics, general SDK redesign or runtime-floor changes for SDK consumers.
- Registry publication/release infrastructure or benchmarking/telemetry projects beyond packaging verification and necessary bounded-resource smoke evidence.

## Further Notes

- Source map: [แยก Player/CLI และเพิ่มการรับบันทึกผ่าน CLI](map.md). The linked decision tickets contain the conversation agreements; several retain their planning status because this spec task does not retroactively resolve multiple Wayfinder tickets.
- Package responsibility decision: [ขอบเขตแพ็กเกจและการติดตั้ง CLI กับ Player](issues/01-package-boundaries.md#answer).
- HTTP scope: [ช่องทางรับข้อมูลและ protocol ชุดแรก](issues/02-initial-handlers.md#comments).
- Handler/event contracts: [สัญญาระหว่าง Handler กับ Recorder](issues/03-handler-contract.md#comments).
- Forwarding and errors: [ขอบเขตการส่งต่อและบันทึกของ Proxy](issues/04-proxy-contract.md#comments).
- Shutdown/limits: [วงจรการบันทึกและความปลอดภัยบนเครื่องผู้ใช้](issues/05-recording-lifecycle.md#comments).
- Presets/output: [รูปแบบ declarative Record Preset และลำดับการตั้งค่า](issues/06-record-presets.md#comments).
- This spec intentionally supersedes the earlier single-package distribution constraint. It preserves existing user workflows while changing the installed package that owns the executable.
- The user explicitly approved the installed-CLI → real local HTTP/upstream → Recording → real Player acceptance seam before publication. No new product interview is required to begin implementation planning.
- Exact internal type names, module locations, unagreed option spelling, schema library choice, random-word vocabulary and measured finite resource thresholds remain implementation details, not new product scope or placeholder features.
- At publication only specification and agreed domain/planning documents have been changed. The new record command and packaging cutover have not been implemented or verified. An existing CLI help invocation was observed successfully during scoping; it does not prove the new behaviour.
