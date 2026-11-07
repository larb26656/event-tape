import { createStore } from 'zustand/vanilla'
import type { RecordingEnvelope } from '@event-tape/recording-format'

export function eventAtTime(
  events: RecordingEnvelope[],
  elapsedMs: number,
): RecordingEnvelope | undefined {
  let latest: RecordingEnvelope | undefined
  for (const event of events) {
    if (event.elapsedMs > elapsedMs) continue
    if (
      !latest ||
      event.elapsedMs > latest.elapsedMs ||
      (event.elapsedMs === latest.elapsedMs && event.seq > latest.seq)
    ) latest = event
  }
  return latest
}

type PlaybackState = {
  events: RecordingEnvelope[]
  playheadMs: number
  playing: boolean
  speed: 1 | 2 | 4
  selectedIndex: number
  durationMs: number
  canSeek: boolean
  setEvents: (events: RecordingEnvelope[]) => void
  play: () => void
  pause: () => void
  toggle: () => void
  setSpeed: (speed: 1 | 2 | 4) => void
  advance: (realElapsedMs: number) => void
  seek: (elapsedMs: number) => void
  selectEvent: (index: number) => void
  currentEvent: () => RecordingEnvelope | undefined
}

export function createPlaybackStore() {
  return createStore<PlaybackState>()((set, get) => ({
    events: [],
    playheadMs: 0,
    playing: false,
    speed: 1,
    selectedIndex: -1,
    durationMs: 0,
    canSeek: false,
    setEvents: (events) => {
      const durationMs = events.reduce((max, event) => Math.max(max, event.elapsedMs), 0)
      set({ events, durationMs, canSeek: durationMs > 0, playheadMs: 0, playing: false, selectedIndex: -1 })
    },
    play: () => set((state) => state.durationMs > 0 && state.playheadMs < state.durationMs ? { playing: true } : {}),
    pause: () => set({ playing: false }),
    toggle: () => get().playing ? get().pause() : get().play(),
    setSpeed: (speed) => set({ speed }),
    advance: (realElapsedMs) => set((state) => {
      if (!state.playing) return {}
      const playheadMs = Math.min(state.durationMs, state.playheadMs + realElapsedMs * state.speed)
      return { playheadMs, playing: playheadMs < state.durationMs, selectedIndex: -1 }
    }),
    seek: (elapsedMs) => set((state) => {
      const playheadMs = Math.max(0, Math.min(state.durationMs, elapsedMs))
      let selectedIndex = -1
      let distance = Infinity
      state.events.forEach((event, index) => {
        const candidateDistance = Math.abs(event.elapsedMs - playheadMs)
        if (candidateDistance < distance || (candidateDistance === distance && event.seq > state.events[selectedIndex]!.seq)) {
          selectedIndex = index
          distance = candidateDistance
        }
      })
      return { playheadMs, playing: false, selectedIndex }
    }),
    selectEvent: (index) => set((state) => {
      const event = state.events[index]
      return event ? { selectedIndex: index, playheadMs: event.elapsedMs, playing: false } : { playing: false }
    }),
    currentEvent: () => {
      const state = get()
      return state.playing
        ? eventAtTime(state.events, state.playheadMs)
        : state.events[state.selectedIndex] ?? eventAtTime(state.events, state.playheadMs)
    },
  }))
}
