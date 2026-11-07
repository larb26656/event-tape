import { describe, expect, it } from 'vitest'
import { parseRecordingJsonl } from './index.js'

const valid = JSON.stringify({
  version: 1,
  seq: 1,
  timestamp: '2026-11-07T10:00:00.000Z',
  elapsedMs: 0,
  source: 'listener',
  payload: { id: 7 },
})

describe('recording JSONL parser', () => {
  it('accepts complete records with and without a final newline', () => {
    expect(parseRecordingJsonl(`${valid}\n${valid}`).events).toHaveLength(2)
    expect(parseRecordingJsonl(valid).events).toHaveLength(1)
  })

  it('recovers only an incomplete final JSON fragment and warns', () => {
    expect(parseRecordingJsonl(`${valid}\n{"version":`).events).toHaveLength(1)
    expect(parseRecordingJsonl(`${valid}\n{"version":`).warning).toMatch(/Line 2/)
  })

  it('returns an empty result and warning when no complete record remains', () => {
    const result = parseRecordingJsonl('{"version":')
    expect(result.events).toEqual([])
    expect(result.warning).toMatch(/Line 1/)
  })

  it('rejects malformed middle lines with a line number and cause', () => {
    expect(() => parseRecordingJsonl(`${valid}\nnot-json\n${valid}`)).toThrow(
      /Line 2:.*JSON/,
    )
  })

  it('rejects unsupported envelope versions', () => {
    expect(() => parseRecordingJsonl('{"version":2}')).toThrow(
      /Line 1: unsupported version/,
    )
  })

  it('rejects an incomplete fragment that was terminated by a newline', () => {
    expect(() => parseRecordingJsonl(`${valid}\n{"version":\n`)).toThrow(
      /Line 2:.*JSON/,
    )
  })
})
