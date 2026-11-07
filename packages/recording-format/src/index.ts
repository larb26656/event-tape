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
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("envelope must be an object")
  }
  const event = value as Record<string, unknown>
  if (event.version !== 1) throw new Error("unsupported version")
  if (!Number.isSafeInteger(event.seq) || (event.seq as number) < 1) throw new Error("invalid seq")
  if (typeof event.timestamp !== "string" || !Number.isFinite(Date.parse(event.timestamp))) throw new Error("invalid timestamp")
  if (typeof event.elapsedMs !== "number" || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) throw new Error("invalid elapsedMs")
  if (typeof event.source !== "string") throw new Error("invalid source")
  if (event.direction !== undefined && typeof event.direction !== "string") throw new Error("invalid direction")
  if (!("payload" in event)) throw new Error("missing payload")
  return event as unknown as RecordingEnvelope
}
