import { describe, expect, it } from 'vitest'
import { createPlaybackStore } from './playback'
import type { RecordingEnvelope } from '@event-tape/recording-format'

const events = [
  { seq: 1, elapsedMs: 0 },
  { seq: 2, elapsedMs: 10_000 },
  { seq: 4, elapsedMs: 10_000 },
  { seq: 3, elapsedMs: 20_000 },
].map((event) => ({
  version: 1 as const,
  timestamp: '2026-01-01T00:00:00.000Z',
  source: 'test',
  payload: null,
  ...event,
})) satisfies RecordingEnvelope[]

describe('playback clock and event lookup', () => {
  it('advances by elapsed time, preserving quiet intervals and pause', () => {
    const store = createPlaybackStore()
    store.getState().setEvents(events)
    store.getState().play()
    store.getState().advance(2500)
    expect(store.getState().playheadMs).toBe(2500)
    store.getState().setSpeed(2)
    store.getState().advance(1250)
    expect(store.getState().playheadMs).toBe(5000)
    store.getState().pause()
    store.getState().advance(5000)
    expect(store.getState().playheadMs).toBe(5000)
  })

  it('uses highest sequence when events share the current timestamp', () => {
    const store = createPlaybackStore()
    store.getState().setEvents(events)
    store.getState().seek(10_000)
    expect(store.getState().currentEvent()?.seq).toBe(4)
  })

  it('selects an exact event and stops; seeking also pauses', () => {
    const store = createPlaybackStore()
    store.getState().setEvents(events)
    store.getState().play()
    store.getState().selectEvent(1)
    expect(store.getState().playheadMs).toBe(10_000)
    expect(store.getState().selectedIndex).toBe(1)
    expect(store.getState().playing).toBe(false)
    store.getState().play()
    store.getState().seek(12_000)
    expect(store.getState().playing).toBe(false)
  })

  it('stops at duration and disables play on empty or zero-duration recordings', () => {
    const store = createPlaybackStore()
    store.getState().setEvents(events)
    store.getState().play()
    store.getState().setSpeed(4)
    store.getState().advance(5000)
    expect(store.getState().playheadMs).toBe(20_000)
    expect(store.getState().playing).toBe(false)
    store.getState().setEvents([events[0]!])
    store.getState().play()
    expect(store.getState().playing).toBe(false)
    store.getState().setEvents([])
    expect(store.getState().durationMs).toBe(0)
    expect(store.getState().canSeek).toBe(false)
  })
})
