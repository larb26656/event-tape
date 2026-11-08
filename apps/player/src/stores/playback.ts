import { create } from 'zustand'
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

function currentIndex(events: RecordingEnvelope[], elapsedMs: number, range: [number, number] | null): number {
  let index = -1
  events.forEach((event, candidate) => {
    if (event.elapsedMs > elapsedMs || (range && (event.elapsedMs < range[0] || event.elapsedMs > range[1]))) return
    const current = events[index]
    if (!current || event.elapsedMs > current.elapsedMs || (event.elapsedMs === current.elapsedMs && event.seq > current.seq)) index = candidate
  })
  return index
}

function nearestIndex(events: RecordingEnvelope[], elapsedMs: number, range: [number, number] | null): number {
  let index = -1
  let distance = Infinity
  events.forEach((event, candidate) => {
    if (range && (event.elapsedMs < range[0] || event.elapsedMs > range[1])) return
    const candidateDistance = Math.abs(event.elapsedMs - elapsedMs)
    if (candidateDistance < distance || (candidateDistance === distance && event.seq > events[index]!.seq)) {
      index = candidate
      distance = candidateDistance
    }
  })
  return index
}

type PlaybackState = {
  events: RecordingEnvelope[]
  playheadMs: number
  playing: boolean
  speed: 0.25 | 0.5 | 1 | 2 | 4
  selectedIndex: number
  durationMs: number
  canSeek: boolean
  range: [number, number] | null
  setEvents: (events: RecordingEnvelope[]) => void
  play: () => void
  pause: () => void
  toggle: () => void
  setSpeed: (speed: 0.25 | 0.5 | 1 | 2 | 4) => void
  advance: (realElapsedMs: number) => void
  seek: (elapsedMs: number) => void
  selectEvent: (index: number) => void
  setRange: (start: number, end: number) => void
  clearRange: () => void
  currentEvent: () => RecordingEnvelope | undefined
}

export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
    events: [],
    playheadMs: 0,
    playing: false,
    speed: 1,
    selectedIndex: -1,
    durationMs: 0,
    canSeek: false,
    range: null,
    setEvents: (events) => {
      const durationMs = events.reduce((max, event) => Math.max(max, event.elapsedMs), 0)
      set({ events, durationMs, canSeek: durationMs > 0, playheadMs: 0, playing: false, selectedIndex: -1, range: null })
    },
    play: () => set((state) => {
      const [start, end] = state.range ?? [0, state.durationMs]
      if (end <= start) return {}
      const playheadMs = state.playheadMs >= end ? start : Math.max(start, state.playheadMs)
      return { playing: true, playheadMs, selectedIndex: currentIndex(state.events, playheadMs, state.range) }
    }),
    pause: () => set({ playing: false }),
    toggle: () => get().playing ? get().pause() : get().play(),
    setSpeed: (speed) => set({ speed }),
    advance: (realElapsedMs) => set((state) => {
      if (!state.playing) return {}
      const end = state.range?.[1] ?? state.durationMs
      const playheadMs = Math.min(end, state.playheadMs + realElapsedMs * state.speed)
      return { playheadMs, playing: playheadMs < end, selectedIndex: currentIndex(state.events, playheadMs, state.range) }
    }),
    seek: (elapsedMs) => set((state) => {
      const [start, end] = state.range ?? [0, state.durationMs]
      const playheadMs = Math.max(start, Math.min(end, elapsedMs))
      const selectedIndex = nearestIndex(state.events, playheadMs, state.range)
      return { playheadMs, playing: false, selectedIndex }
    }),
    selectEvent: (index) => set((state) => {
      const event = state.events[index]
      return event && (!state.range || (event.elapsedMs >= state.range[0] && event.elapsedMs <= state.range[1]))
        ? { selectedIndex: index, playheadMs: event.elapsedMs, playing: false }
        : { playing: false }
    }),
    setRange: (start, end) => set((state) => {
      const a = Math.max(0, Math.min(state.durationMs, start))
      const b = Math.max(0, Math.min(state.durationMs, end))
      const range: [number, number] = [Math.min(a, b), Math.max(a, b)]
      return { range, playheadMs: range[0], playing: false, selectedIndex: currentIndex(state.events, range[0], range) }
    }),
    clearRange: () => set((state) => ({
      range: null,
      playing: false,
      selectedIndex: currentIndex(state.events, state.playheadMs, null),
    })),
    currentEvent: () => {
      const state = get()
      return state.events[state.selectedIndex] ?? state.events[currentIndex(state.events, state.playheadMs, state.range)]
    },
}))
