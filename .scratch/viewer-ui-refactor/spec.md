# Viewer UI refactor

Status: ready-for-agent

## Problem Statement

The Viewer mixes shadcn components, native controls, Tailwind utilities, and custom cross-component CSS. Although Tailwind is already used substantially, ordinary controls and feedback do not share a consistent component foundation. This makes UI changes harder to keep consistent and maintain. The user wants to refactor the entire Viewer UI, not redesign the product or rewrite the Recorder and recording format.

## Solution

Standardize ordinary Viewer controls and feedback on shadcn, retaining the current Nova/Base UI foundation. Make Tailwind the primary tool for component layout and ordinary styling. Preserve existing workflows, capabilities, information, and specialized rendering. Component-standard visual details may change, but screen organization and interaction flows must remain recognizable.

## User Stories

1. As a Viewer user, I want consistent controls, so that actions behave predictably throughout the interface.
2. As a Viewer maintainer, I want ordinary controls composed from shadcn, so that I do not maintain parallel custom implementations.
3. As a Viewer maintainer, I want every added shadcn component installed through the official CLI, so that its source and composition follow the upstream component foundation.
4. As a Viewer maintainer, I want ordinary styling and layout local to components through Tailwind, so that changing one surface does not unexpectedly restyle another.
5. As a Viewer maintainer, I want theme and specialized rendering styles retained where necessary, so that standardization does not break runtime-dependent rendering.
6. As a Viewer user, I want to open a Recording from the CLI, so that packaged usage continues to work.
7. As a Viewer user, I want to choose and replace a local Recording, so that I can inspect another file without stale events or selection.
8. As a Viewer user, I want session recent files to remain available, so that I can reopen recordings during the current session.
9. As a Viewer user, I want clear loading feedback, so that I understand when a Recording is being read.
10. As a Viewer user, I want actionable error and recovery feedback, so that malformed or partially recoverable input remains understandable.
11. As a Viewer user, I want explicit empty-recording and no-selection states, so that absence of events is not confused with failure.
12. As a Viewer user, I want events ordered by time and sequence, so that inspection remains deterministic.
13. As a Viewer user, I want case-insensitive search across complete event JSON, so that I can find envelope or payload content.
14. As a Viewer user, I want search to filter only the event list, so that Playback, the overview, and inspection retain their existing meaning.
15. As a Viewer user, I want direct selection to inspect the exact event, including events sharing timestamps, so that event identity is preserved.
16. As a Viewer user, I want keyboard navigation among visible search results without wrapping or stealing focus, so that keyboard inspection stays reliable.
17. As a Viewer user, I want large recordings to remain virtualized, so that browsing does not require rendering every row.
18. As a Viewer user, I want to play, pause, change among the existing speeds, and restart at the end, so that Playback retains its current controls.
19. As a Viewer user, I want seeking to pause and inspect the nearest event without snapping the requested time, so that quiet intervals remain inspectable.
20. As a Viewer user, I want automatic Playback to follow the latest event at or before the clock with existing sequence tie-breaking, so that event selection stays consistent.
21. As a Viewer user, I want to select inclusive time ranges by dragging or using the existing keyboard shortcuts and clear them, so that focused inspection continues to work.
22. As a Viewer user, I want range navigation and stopping at the range end, including event-free ranges, so that Playback respects my selected bounds.
23. As a Viewer user, I want zero-duration recordings to remain inspectable, so that degenerate timing does not break controls.
24. As a Viewer user, I want complete syntax-highlighted event JSON that remains selectable and copyable, so that inspection does not hide or alter recorded data.
25. As a Viewer user, I want keyboard-operable resizable panes, so that I can allocate space to event browsing and inspection.
26. As a Viewer user, I want the existing narrow-screen arrangement preserved, so that the Viewer remains usable in smaller windows.
27. As a Viewer user, I want existing light/dark theme behavior and readable syntax colors, so that the refactor does not reduce legibility.
28. As a Viewer user, I want accessible names, visible focus, and appropriate feedback semantics, so that replacing controls does not regress accessibility.
29. As a Viewer user, I want local Recording handling to remain local, so that the UI refactor does not introduce data transmission.

## Implementation Decisions

- Scope covers the entire Viewer UI: shell, header/file actions, recent-file menu, ordinary controls, feedback states, event browsing, inspection, and Playback control composition.
- Retain the current shadcn Nova/Base UI foundation, semantic theme tokens, and established icon library. Do not switch presets or primitive libraries.
- Add every shadcn component exclusively through the official shadcn CLI using the workspace's pnpm runner. Never hand-write or manually copy a substitute shadcn component. Inspect generated components and follow their documented APIs before integration.
- Reuse existing appropriate components; install missing components through the CLI. Use suitable shadcn controls and feedback primitives rather than keeping competing custom equivalents.
- Viewer-specific components may compose CLI-installed primitives. Domain-specific event rows, virtualized rendering, canvas timeline interactions, and Prism JSON rendering remain specialized implementations where generic components do not match their semantics.
- Use Tailwind for ordinary layout and styling. Remove obsolete custom styling and cross-component selectors as their consumers migrate; do not leave duplicate implementations or compatibility shims.
- Allow CSS for theme tokens, syntax highlighting, and genuinely specialized rendering. Allow inline dimensions and positions calculated at runtime for virtualization and similar behavior. Zero CSS or zero inline styles is not an objective.
- Refactor UI component boundaries and composition as necessary, without restructuring playback-store, loading-Worker, or CLI internals. Their behavior and public contracts remain unchanged.
- Keep screen organization, workflows, event identity, time/range semantics, keyboard interactions, responsive behavior, and current theme behavior. Component-standard visual details may change; this is not a pixel-identical requirement.
- Preserve local-only processing, replacement/reset behavior, and session-memory recent files. No new persistence or network services.
- No schema, recording-format, SDK, or external API changes.

## Testing Decisions

- The user confirmed the proposed seams: actual Viewer UI served through the packaged CLI is the primary verification surface; existing playback-store tests are supporting regression coverage. Do not introduce a new automated browser suite for this effort.
- Exercise the primary surface at desktop and narrow widths, in existing theme modes, with keyboard and pointer interactions. Verify actual rendering, focus, selection, and state transitions rather than relying on build success.
- Cover initial opening, file replacement, recent files, loading/errors/recovery/empty states, search, exact selection, Playback speeds and seeking, range marking/navigation/clearing, resizable panes, and complete JSON inspection. Verify the packaged asset route, not only the development server.
- Exercise a large Recording, using 100,000 events as the existing scale scenario, and observe virtualization and selection. Do not interpret this smoke check as a general performance benchmark.
- Existing playback-store tests are prior art for timing, ties, exact selection, quiet intervals, zero duration, replacement, and large-recording selection. Run them to protect unchanged behavior, rather than reimplementing the store for the refactor.
- Existing parser and Recorder tests remain unchanged unless a real affected contract requires an update; those internals are outside this change.
- Run relevant existing automated checks and build the packaged Viewer. Passing automated checks does not replace browser smoke verification.
- Good tests assert consumer-visible behavior, boundaries, transitions, and errors. Do not add tests for component wiring, copied props, source text, class names, incidental markup, or mock echoes. Any new permanent regression test must target a plausible behavioral regression at an existing seam.
- Acceptance requires completing the UI migration without obsolete parallel controls/styles and preserving the listed behaviors. Record exercised checks and smoke results; do not claim unperformed verification.

## Out of Scope

- Recorder SDK and shared recording-format changes.
- Playback-store, loading-Worker, and CLI internal redesigns.
- New screen organization, workflows, or capabilities.
- Replay: Playback continues to inspect a Recording without emitting events into another system.
- Replacing virtualization, the canvas overview, or JSON highlighting solely to maximize shadcn usage.
- A new preset, primitive library, visual rebrand, or pixel-identical recreation of custom controls.
- New persistence, telemetry, network services, or automated browser-test infrastructure.

## Further Notes

- This specification synthesizes the agreed interview decisions, including the CLI-only component rule and the explicitly confirmed verification seams.
- Existing Tailwind usage is substantial; consistency and maintainability, not an adoption percentage, define success.
- Publishing this specification does not start implementation or create implementation tickets. Ticket breakdown can follow as a separate step.
- No application code was changed and no runtime verification was performed while producing this document.
