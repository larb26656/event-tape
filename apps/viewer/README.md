# Event Tape Viewer

Install the packed `@event-tape/viewer` package in a Node.js 22+ project. Its `event-tape` executable serves the included static Viewer assets locally; it does not require the Vite development server or a source checkout.

```sh
npm install @event-tape/viewer
npx event-tape view ./recordings/session.jsonl
```

The CLI prints a loopback URL and opens it in the system browser. Use `npx event-tape view ./recordings/session.jsonl --no-browser` to suppress browser launch and copy the printed URL. The CLI serves the selected recording and packaged HTML, JS, CSS, fonts, and parsing Worker from the local machine. The Viewer loads files locally; it does not upload recording contents.

The SDK's JSONL contract is versioned. Each event is one JSON object per line with a timestamp, increasing sequence number, elapsed milliseconds, source, optional direction, and JSON payload. Empty lines and malformed, truncated, unsupported, or schema-invalid records are shown as load errors rather than silently accepted. A partial final JSON fragment may be discarded with a warning. Empty recordings load with zero events. A zero-duration recording can be inspected event-by-event, but cannot be played or sought. Playback ends at the final event and never replays events into an application.

## Playback behavior

Play advances a clock by recorded `elapsedMs` (including quiet intervals), at 0.25×, 0.5×, 1×, 2×, or 4×. During automatic Playback, the selected list event and displayed JSON follow the latest event at or before the playhead; equal timestamps prefer the highest sequence number. Clicking the Timeline or seeking with the position control pauses Playback and inspects the nearest event while retaining the requested playhead time. Equidistant events and duplicate timestamps prefer the highest sequence number. Selecting a list event instead pauses and inspects that exact event at its recorded time, including individually selectable events with duplicate timestamps. Raw JSON displays the selected event envelope and payload. Seeking supports fractional millisecond positions.

The Viewer shows the virtualized Recording events list on the left and the Raw JSON inspector in the center, with the player spanning the bottom. Drag the separator or focus it and use the arrow keys to resize the panes. On narrow screens the panes stack and the separator resizes them vertically. Select an event in the list to pause Playback, move to its recorded time, and inspect its complete envelope and payload. Use the player controls to play, pause, change speed, or seek. Keyboard activation of the Timeline overview moves focus to the Playback position control for seeking.

The selected event uses the theme's muted surface. With an event focused, use the up and down arrow keys to select the previous or next visible result.

When no recording is loaded, the Viewer shows an empty state with an option to open a local file. Recently opened files are kept only in memory for the current session and are not persisted across reloads.

The Raw JSON inspector syntax-highlights keys and values while keeping the complete formatted JSON selectable and copyable.

Drag across the Timeline overview to select an inclusive playback range. Alternatively, focus the Playback position control, seek to the start and press `I`, then seek to the end and press `O`. Selecting a range pauses Playback and moves the playhead to its start. The list shows only events within the range, and Playback stops at its end. A range containing no events shows no selection or JSON. Clear range restores the full recording; search can further filter the range.

Search events matches a case-insensitive substring anywhere in the complete event JSON, including field names and nested payloads. It filters only the list: the Timeline, Playback, and inspected event remain unchanged, even when the selected event is hidden. Clear the search to restore all events within the current range. Regular expressions, structured queries, and saved searches are not supported.

## Viewer UI development

The Viewer uses Tailwind and shadcn's Base UI Nova components. Add shadcn components with `pnpm dlx shadcn@latest add <component>` from the Viewer directory; do not hand-write replacements. Keep theme and syntax styles in the shared stylesheet and runtime-calculated styles where needed for virtualized or canvas-based views.

## Target-size and external-package smoke

A packed-artifact smoke was run from a Vite project initialized by the Vite CLI outside the monorepo. The project installed the SDK and Viewer tarballs locally; its ESM listener recorded request/response/worker events without ACP, awaited `close()`, then the installed `event-tape` CLI served the recording in Chrome 150 on macOS at 1365×768. The Viewer loaded the packaged HTML, scripts, stylesheet, font, and Worker from loopback; browser requests had no non-loopback destinations.

- Target fixture: 100,000 valid events, 13,466,684 bytes (13.47 MB decimal; below both 50 MB and 100,000-event limits).
- Observed all events loaded; the virtualized list contained 13 rows at the tested viewport. Scrolling to and selecting #100000 showed its matching payload. Seeking to the tied 99,998 ms timestamp displayed the higher sequence #100000.
- Playback speed 2× selection and 4× playback reached the final 0.24 s on the three-event consumer recording. Replacing the loaded file reset the Viewer to 0.00 / 0.24 s and showed the new event data.
- Empty recording showed “No events in this recording.” A valid zero-duration one-event file remained inspectable with Play and seek disabled. An invalid sequence number showed `Line 1: invalid seq` as a load error.
- CLI requests loaded the packaged Worker and other static assets without a Vite server or source checkout. No requests went to non-loopback origins.

This correctness smoke was run in one browser environment; it is not a latency or broader performance guarantee. The event list uses TanStack Virtual and renders only visible rows plus a small overscan. The timeline overview is a fixed-width canvas summary, not one DOM marker per event. The Worker parses the complete recording; events are not hidden or discarded to meet the target. Files above 50 MB or 100,000 events are not rejected, but performance outside the acceptance target is not guaranteed; parsing retains events in browser memory.
