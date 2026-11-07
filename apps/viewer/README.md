# Viewer Playback

Playback is a view-only timeline inspection tool. Play advances a clock by recorded `elapsedMs` (including quiet intervals), at 1×, 2×, or 4×. The displayed JSON is the latest event at or before the playhead; equal timestamps prefer the highest sequence number. Selecting a timeline event pauses playback and inspects that exact event.

Playback is not Replay: it never emits recorded events to the original application, a protocol, or an adapter. Duration ends at the final event, and playback stops there without looping. An empty recording or one whose final event is at 0 ms cannot be played or sought, but individual events remain inspectable in the timeline.

## Target-size recordings

The acceptance target is a recording within both 50 MB and 100,000 events. The event list uses TanStack Virtual and renders only the visible rows plus a small overscan. The timeline overview is a fixed-width canvas summary; it does not create one DOM marker per event. The Web Worker parses the complete recording before the Viewer installs its events for playback; no future events are hidden or discarded to meet the target.

The target is not a maximum file size. The Viewer does not reject recordings because they exceed 50 MB or 100,000 events, but performance outside the target is not guaranteed. Full parsing retains events in memory, so available browser memory remains a practical constraint.

### Observed target-size smoke

- Fixture: 100,000 JSONL events, exactly 16,866,680 bytes (16.87 MB decimal; below the 50 MB target).
- Environment: Viewer CLI on macOS, Chrome 150.0.0.0, 1365×768 viewport.
- Observed: loaded all 100,000 events; scrolling to the final rows showed #100000 with its matching payload. The virtual list had 13 event rows in the DOM at that viewport. Clicking #99999 showed payload `fixtureEvent: 99999`; seeking to the tied 99,998 ms timestamp showed the higher sequence #100000 and payload `fixtureEvent: 100000`.
- File change: replaced the loaded recording with a 138-byte one-event file; the count changed to 1 and playback returned to 0.00 / 0.50 s with no stale selection displayed.

This is a correctness smoke in one browser environment, not a latency or broader performance guarantee.
