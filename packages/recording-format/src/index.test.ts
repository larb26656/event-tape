import { describe, expect, it } from 'vitest'
import { parseEnvelope } from './index.js'

describe('recording envelope', () => {
  it('accepts a v1 event and omits optional direction', () => {
    const event = {
      version: 1,
      seq: 1,
      timestamp: '2026-11-07T10:00:00.000Z',
      elapsedMs: 0,
      source: 'listener',
      payload: { id: 7 },
    }
    expect(parseEnvelope(event)).toEqual(event)
  })
  it('rejects unsupported versions and malformed fields', () => {
    expect(() => parseEnvelope({ version: 2 })).toThrow(/version/)
    expect(() => parseEnvelope({ version: 1, seq: 0 })).toThrow(/seq/)
  })
})
