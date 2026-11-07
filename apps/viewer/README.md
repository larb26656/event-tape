# Event Tape Viewer

Install the packed `@event-tape/viewer` package in a Node.js 22+ project. Its `event-tape` executable serves the included static Viewer assets locally; it does not require the Vite development server or a source checkout.

```sh
npm install @event-tape/viewer
npx event-tape view ./recordings/session.jsonl
```

The CLI prints a loopback URL and opens it in the system browser. Use `npx event-tape view ./recordings/session.jsonl --no-browser` to suppress browser launch and copy the printed URL. The CLI serves the selected recording and packaged HTML, JS, CSS, fonts, and parsing Worker from the local machine. The Viewer loads files locally; it does not upload recording contents.

The SDK's JSONL contract is versioned. Each event is one JSON object per line with a timestamp, increasing sequence number, elapsed milliseconds, source, optional direction, and JSON payload. Empty lines and malformed, truncated, unsupported, or schema-invalid records are shown as load errors rather than silently accepted. A partial final JSON fragment may be discarded with a warning. Empty recordings load with zero events. A zero-duration recording can be inspected event-by-event, but cannot be played or sought. Playback ends at the final event and never replays events into an application.

## Playback behavior

Play advances a clock by recorded `elapsedMs` (including quiet intervals), at 1×, 2×, or 4×. During automatic Playback, the displayed JSON is the latest event at or before the playhead; equal timestamps prefer the highest sequence number. Clicking the Timeline or seeking with the position control pauses Playback and inspects the nearest event while retaining the requested playhead time. Equidistant events and duplicate timestamps prefer the highest sequence number. Selecting a list event instead pauses and inspects that exact event at its recorded time, including individually selectable events with duplicate timestamps. Raw JSON displays the selected event envelope and payload. Seeking supports fractional millisecond positions.

The Viewer places the virtualized Recording events list beside the Timeline and Raw JSON inspector. On narrow screens these panes stack in that order. Select an event in the list to pause Playback, move to its recorded time, and inspect its complete envelope and payload. Use the Timeline controls to play, pause, change speed, or seek.

## Target-size and external-package smoke

A packed-artifact smoke was run from a Vite project initialized by the Vite CLI outside the monorepo. The project installed the SDK and Viewer tarballs locally; its ESM listener recorded request/response/worker events without ACP, awaited `close()`, then the installed `event-tape` CLI served the recording in Chrome 150 on macOS at 1365×768. The Viewer loaded the packaged HTML, scripts, stylesheet, font, and Worker from loopback; browser requests had no non-loopback destinations.

- Target fixture: 100,000 valid events, 13,466,684 bytes (13.47 MB decimal; below both 50 MB and 100,000-event limits).
- Observed all events loaded; the virtualized list contained 13 rows at the tested viewport. Scrolling to and selecting #100000 showed its matching payload. Seeking to the tied 99,998 ms timestamp displayed the higher sequence #100000.
- Playback speed 2× selection and 4× playback reached the final 0.24 s on the three-event consumer recording. Replacing the loaded file reset the Viewer to 0.00 / 0.24 s and showed the new event data.
- Empty recording showed “No events in this recording.” A valid zero-duration one-event file remained inspectable with Play and seek disabled. An invalid sequence number showed `Line 1: invalid seq` as a load error.
- CLI requests loaded the packaged Worker and other static assets without a Vite server or source checkout. No requests went to non-loopback origins.

This correctness smoke was run in one browser environment; it is not a latency or broader performance guarantee. The event list uses TanStack Virtual and renders only visible rows plus a small overscan. The timeline overview is a fixed-width canvas summary, not one DOM marker per event. The Worker parses the complete recording; events are not hidden or discarded to meet the target. Files above 50 MB or 100,000 events are not rejected, but performance outside the acceptance target is not guaranteed; parsing retains events in browser memory.
