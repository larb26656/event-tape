export interface RecordingEnvelope {
  version: 1
  seq: number
  timestamp: string
  elapsedMs: number
  source: string
  direction?: string
  payload: unknown
}

export function parseEnvelope(value: unknown): RecordingEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('envelope must be an object')
  const event = value as Record<string, unknown>
  if (event.version !== 1) throw new Error('unsupported version')
  if (!Number.isSafeInteger(event.seq) || (event.seq as number) < 1)
    throw new Error('invalid seq')
  if (
    typeof event.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(event.timestamp))
  )
    throw new Error('invalid timestamp')
  if (
    typeof event.elapsedMs !== 'number' ||
    !Number.isFinite(event.elapsedMs) ||
    event.elapsedMs < 0
  )
    throw new Error('invalid elapsedMs')
  if (typeof event.source !== 'string') throw new Error('invalid source')
  if (event.direction !== undefined && typeof event.direction !== 'string')
    throw new Error('invalid direction')
  if (!('payload' in event)) throw new Error('missing payload')
  return event as unknown as RecordingEnvelope
}

export interface RecordingJsonlResult {
  events: RecordingEnvelope[]
  warning?: string
}

export function parseRecordingJsonl(text: string): RecordingJsonlResult {
  const lines = text.split('\n')
  const hasFinalNewline = text.endsWith('\n')
  const events: RecordingEnvelope[] = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ''
    if (!line.trim()) {
      if (index === lines.length - 1 && hasFinalNewline) continue
      if (!hasFinalNewline && index === lines.length - 1) break
      throw new Error(`Line ${index + 1}: empty lines are not valid JSONL records`)
    }
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch (cause) {
      if (!hasFinalNewline && index === lines.length - 1) {
        return {
          events,
          warning: `Line ${index + 1}: incomplete final JSON; later recording data may be missing.`,
        }
      }
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`Line ${index + 1}: invalid JSON: ${detail}`, { cause })
    }
    try {
      events.push(parseEnvelope(value))
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`Line ${index + 1}: ${detail}`, { cause })
    }
  }
  return { events }
}
