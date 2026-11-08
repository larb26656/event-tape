import { beforeEach, describe, expect, it } from 'vitest'
import { usePlaybackStore as store } from './stores/playback'
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

beforeEach(() => store.setState(store.getInitialState(), true))

describe('playback clock and event lookup', () => {
  it('advances by elapsed time, preserving quiet intervals and pause', () => {
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
    store.getState().setEvents(events)
    store.getState().seek(10_000)
    expect(store.getState().currentEvent()?.seq).toBe(4)
  })

  it('selects an exact event and stops; seeking also pauses', () => {
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

  it('seeking at a selected tied timestamp shows the latest event by sequence', () => {
    store.getState().setEvents(events)
    store.getState().selectEvent(1)
    expect(store.getState().currentEvent()?.seq).toBe(2)

    store.getState().seek(10_000)

    expect(store.getState().selectedIndex).toBe(2)
    expect(store.getState().currentEvent()?.seq).toBe(4)
  })

  it('keeps a requested quiet-interval time while inspecting the nearest event', () => {
    store.getState().setEvents(events)
    store.getState().play()
    store.getState().seek(6_000)

    expect(store.getState().playheadMs).toBe(6_000)
    expect(store.getState().playing).toBe(false)
    expect(store.getState().currentEvent()?.seq).toBe(4)
    expect(store.getState().events[store.getState().selectedIndex]?.seq).toBe(4)

    store.getState().seek(5_000)
    expect(store.getState().currentEvent()?.seq).toBe(4)
    store.getState().play()
    store.getState().advance(1)
    expect(store.getState().currentEvent()?.seq).toBe(1)
  })

  it('clears selection and playhead when a different recording is loaded', () => {
    store.getState().setEvents(events)
    store.getState().selectEvent(3)
    store.getState().setEvents([events[0]!])

    expect(store.getState().selectedIndex).toBe(-1)
    expect(store.getState().playheadMs).toBe(0)
    expect(store.getState().currentEvent()?.seq).toBe(1)
  })

  it('selects the final event by index in a 100,000-event recording', () => {
    const largeRecording = Array.from({ length: 100_000 }, (_, index) => ({
      ...events[0]!,
      seq: index + 1,
      elapsedMs: index,
      payload: { index },
    }))
    store.getState().setEvents(largeRecording)
    store.getState().selectEvent(99_999)

    expect(store.getState().selectedIndex).toBe(99_999)
    expect(store.getState().currentEvent()?.seq).toBe(100_000)
    expect(store.getState().currentEvent()?.payload).toEqual({ index: 99_999 })
  })
})
