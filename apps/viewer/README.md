# Viewer Playback

Playback is a view-only timeline inspection tool. Play advances a clock by recorded `elapsedMs` (including quiet intervals), at 1×, 2×, or 4×. The displayed JSON is the latest event at or before the playhead; equal timestamps prefer the highest sequence number. Selecting a timeline event pauses playback and inspects that exact event.

Playback is not Replay: it never emits recorded events to the original application, a protocol, or an adapter. Duration ends at the final event, and playback stops there without looping. An empty recording or one whose final event is at 0 ms cannot be played or sought, but individual events remain inspectable in the timeline.
