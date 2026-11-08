# 05: Playback selection and range

**Status:** resolved

During Playback select the current event in the list and show its Raw JSON; support 0.25× and 0.5× speeds. Allow selecting a Playback range on the Timeline, play only within it, and show only events in the range.

## Comments

The user approved the behavior demonstrated by `prototype/viewer-playback-range` (commit `2af6892`). The prototype answers how the playhead, selected event, range and event list interact; range endpoints are inclusive, selection can be cleared, and quiet ranges contain no selected event. The prototype is retained on that branch, not shipped with the Viewer.

For the player controls, the user chose variant B (centered transport controls) and requested removing the numeric range fields. The layout alternatives are retained on `prototype/player-layouts` (commit `a2f6922`).
