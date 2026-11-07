# Recording events: Inspector split

Status: resolved

## Problem Statement

ผู้ใช้ต้องการตรวจ Recording ตามเวลาได้สะดวก โดยตำแหน่งเวลาที่กำลังตรวจ event ที่เลือกในรายการ และรายละเอียดต้องสัมพันธ์กัน ปัจจุบัน Viewer มีรายการ event, TimelineOverview และตัวเลื่อน Playback แต่ไม่มี search หรือ keyboard navigation ในรายการ การเลื่อนเวลาล้างการเลือกในรายการ จึงไม่เห็น cursor ตาม event ที่กำลังตรวจ

## Solution

ใช้รูปแบบ C · Inspector split ที่ผู้ใช้เลือกจาก prototype: ฝั่งซ้ายเป็นช่องค้นหาและรายการ Recording events ตรงกลางเป็น Timeline และตัวควบคุม Playback ฝั่งขวาเป็นรายละเอียด event ในรูป Raw JSON

ผู้ใช้คลิก Timeline หรือลากตัวเลื่อนเวลาเพื่อเลือก event ที่ใกล้เวลานั้นที่สุด โดย cursor ในรายการและ inspector เปลี่ยนตามทันที ขณะลากตัวเลื่อน playhead อยู่ที่เวลาจริงที่ผู้ใช้กำหนด ไม่กระโดดไป timestamp ของ event การเลือก event ในรายการจะย้าย playhead ไปเวลาของ event นั้นและหยุด Playback

ค้นหาข้อความจาก JSON event ทั้งก้อนโดยไม่แยกตัวพิมพ์เล็ก/ใหญ่ กรองเฉพาะรายการ ไม่เปลี่ยน Recording, Timeline หรือ Playback ใช้ปุ่ม ↑/↓ เลือก event ก่อนหน้า/ถัดไปเมื่อรายการมี focus

## User Stories

1. As a Recording reviewer, I want a search-and-list pane, a Timeline pane, and an inspector pane, so that I can navigate and inspect without losing context.
2. As a Recording reviewer, I want to open my own Recording, so that I inspect real events rather than prototype fixtures.
3. As a Recording reviewer, I want events presented in chronological order, so that I can follow what happened.
4. As a Recording reviewer, I want to click the Timeline to select the nearest event, so that I can inspect an interesting time directly.
5. As a Recording reviewer, I want to drag the Playback position continuously, so that I can explore quiet intervals as well as event timestamps.
6. As a Recording reviewer, I want the selected event cursor to follow the time slider, so that the list identifies what I am inspecting.
7. As a Recording reviewer, I want the inspector to update with the selected event, so that the details never contradict the cursor.
8. As a Recording reviewer, I want scrubbing to retain the requested playhead time, so that selecting a nearby event does not hide the time I requested.
9. As a Recording reviewer, I want to click an event to inspect its exact envelope and payload, so that I can distinguish individual events.
10. As a Recording reviewer, I want event selection to move the playhead to its timestamp and pause Playback, so that I can inspect it without the view immediately moving on.
11. As a Recording reviewer, I want the selected row to be visible when navigation changes selection, so that I do not have to locate the cursor manually.
12. As a Recording reviewer, I want ↑ and ↓ to move through the visible event results when the list has focus, so that I can inspect without using the mouse.
13. As a Recording reviewer, I want navigation to stop at the first and last result, so that moving through time does not unexpectedly wrap.
14. As a Recording reviewer, I want normal editing keys in the search field, so that list navigation does not interfere with typing.
15. As a Recording reviewer, I want case-insensitive substring search across the whole event JSON, so that I can find identifiers and content regardless of their field.
16. As a Recording reviewer, I want search to include nested payload fields and values, so that I can locate domain-specific data.
17. As a Recording reviewer, I want search results to preserve event identity and time order, so that choosing a result selects the original event.
18. As a Recording reviewer, I want search to filter only the event list, so that the Timeline still represents the entire Recording.
19. As a Recording reviewer, I want changing the query to preserve Playback position and inspected event, so that searching does not silently navigate.
20. As a Recording reviewer, I want no highlighted result when the selected event is excluded by search, so that the interface does not imply a different event is selected.
21. As a Recording reviewer, I want clearing search to restore the full list, so that I can resume inspecting the surrounding events.
22. As a Recording reviewer, I want an explicit no-results state, so that I can distinguish an unsuccessful search from an empty Recording.
23. As a Recording reviewer, I want to retain existing play, pause, and speed controls, so that the new layout does not remove Playback capabilities.
24. As a Recording reviewer, I want the layout to remain usable on narrow screens, so that the three-pane design does not make content inaccessible.
25. As a Recording reviewer, I want large Recordings to remain navigable, so that adding search and cursor synchronization does not require rendering every event row.

## Implementation Decisions

- Adopt the selected Inspector split structure in the real Viewer, preserving existing Recording loading, recovery warnings, errors, Playback controls, and theme conventions.
- Adapt the existing Viewer composition, Timeline panel and overview, virtualized event list, event inspector, and Playback state model rather than introducing a parallel production Viewer.
- Use original event identity for selection; filtered result positions must not be mistaken for original Recording indexes.
- Search the JSON representation of the complete event envelope, including metadata and nested payload, with case-insensitive substring matching. An empty query restores all events.
- Search changes only list visibility. It does not seek, pause, resume, select another event, or alter the full-Recording Timeline.
- Clicking the Timeline selects the nearest event in time. Scrubbing updates the playhead continuously at the requested time and synchronizes the selected nearest event and inspector without snapping the playhead.
- Direct event selection seeks to that event's elapsed time and pauses, consistent with the existing Viewer behavior. Scrubbing continues to pause Playback.
- Treat the selected event and playhead as related but distinct: nearest-event inspection must not rewrite the requested time during scrubbing.
- Keyboard navigation is scoped to focused list rows, traverses visible search results, stops at boundaries, and updates selection, playhead, inspector, focus, and list visibility. Do not intercept search-field editing keys.
- Preserve inspection when search excludes the selected event. No visible row is highlighted until the selected event is visible again or the user explicitly selects another.
- Retain virtualization and scroll the selected visible row into view without stealing focus from the time control or search field.
- Preserve the existing Recording format and SDK contracts. No schema, server API, or persistence changes are required.
- Replace the throwaway prototype implementation with maintainable production components; do not ship synthetic event fixtures, variant switching, or prototype routes as the real feature.
- Tie policy for equidistant events and multiple events at the same timestamp was not explicitly confirmed. Implementation must define deterministic behavior consistent with existing sequence-based Playback semantics and retain exact individual selection from the list.
- Continuous automatic cursor tracking during playing Playback was not explicitly confirmed; do not silently redefine existing Playback event-at-time behavior as nearest-event behavior.

## Testing Decisions

- Proposed primary seam: the actual Viewer interface with a real Recording loaded. This is the highest consumer-visible boundary and covers search, Timeline input, list cursor, keyboard focus, and inspector together. The seam is recorded for user confirmation; it has not yet been explicitly approved.
- Test externally observable behavior, state transitions, boundaries, and correspondence between time, selected event, and inspector. Do not test component wiring, CSS class names, internal indexes, markup snapshots, or implementation details.
- Exercise a quiet interval: drag to a time between events and verify that the displayed time remains the requested value while the nearest event is highlighted and inspected.
- Exercise direct row selection, Timeline click, keyboard up/down, first/last boundaries, filtered navigation, nested-payload search, case-insensitive matching, clearing search, and no matches.
- Verify that filtering out the selected event preserves its inspector and playhead, removes the visible highlight, and leaves Timeline data and Playback unchanged.
- Verify that arrow keys in the search input do not change event selection, and that scrolling to a selected row does not steal control focus.
- Verify a large Recording through the real UI and confirm selection remains correct when the selected row was outside the rendered virtual window.
- Existing Vitest tests at the Playback store boundary are prior art for clock advancement, quiet intervals, pause, exact-event selection, timestamp ties, empty/zero-duration Recordings, Recording replacement, and 100,000-event selection. Update affected behavioral contracts rather than preserving obsolete selection-clearing assertions.
- No browser test suite has been established by the work so far. A real browser smoke run is required even if state tests pass. Add a permanent browser test seam only if needed and confirmed; do not assume a new framework is already available.
- Inspect the chosen layout at desktop and narrow widths with the real Viewer, not only the synthetic prototype.

## Out of Scope

- Replay: sending Recording events into another system.
- Changes to Recorder, SDK ingestion, Recording schema, or file persistence.
- Regex search, structured query syntax, field-specific filter builders, saved searches, or search highlighting.
- New keyboard shortcuts such as Command-K; the prototype displayed this hint but no such behavior was requested or validated.
- Shipping or maintaining alternate layouts A and B, the variant switcher, or synthetic prototype fixtures in the production Viewer.
- An application-wide visual redesign.

## Further Notes

- User accepted Timeline nearest-event selection, scoped ↑/↓ navigation, whole-event search, and list-only filtering; subsequently accepted case-insensitive substring matching, preserved inspection when filtered out, and non-wrapping keyboard boundaries.
- User explicitly corrected the prototype: moving the Timeline must synchronize the event cursor. User selected C · Inspector split after that adjustment.
- The throwaway prototype currently exists in the working tree. Its URL is `/prototype/recording-events?variant=C`; it uses synthetic data, not the real Recording loading pipeline.
- Prototype type checking passed. Its three variants loaded in a browser, and searching `approved` produced one visible event. Continuous cursor synchronization was edited but the previous browser check did not independently prove the selected row changed; production acceptance must exercise and assert the actual cursor and inspector transition.
- The prototype has not been captured to a throwaway Git branch. After preserving it as a primary source, record the branch pointer on the implementation issue before removing prototype-only code from the main implementation.
- No ADR is warranted for this reversible UI layout decision. Existing glossary meanings of Recording, Viewer, Playback, and Replay remain unchanged.
