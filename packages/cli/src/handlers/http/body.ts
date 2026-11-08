function encodeBody(bytes: Buffer): { encoding: 'utf8' | 'base64'; data: string } {
  const text = bytes.toString('utf8')
  // UTF-8 round-trip detects split multibyte sequences as well as invalid input.
  // Other control bytes are treated as binary, except ordinary text whitespace.
  let hasBinaryControls = false
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      hasBinaryControls = true
      break
    }
  }
  if (Buffer.from(text, 'utf8').equals(bytes) && !hasBinaryControls)
    return { encoding: 'utf8', data: text }
  return { encoding: 'base64', data: bytes.toString('base64') }
}

export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024

export interface CaptureBudget { retained: number }

export function captureBody(limit: number, budget: CaptureBudget) {
  const chunks: Buffer[] = []
  let size = 0
  let capacity = 0
  let truncated = false
  let finished = false
  return {
    add(chunk: Buffer): boolean {
      if (finished) return true
      const take = Math.min(chunk.length, limit - size)
      if (take < chunk.length) truncated = true
      let offset = 0
      while (offset < take) {
        if (size === capacity) {
          const allocation = Math.min(16 * 1024, limit - capacity)
          if (budget.retained + allocation > MAX_CAPTURE_BYTES) return false
          chunks.push(Buffer.allocUnsafe(allocation))
          capacity += allocation
          budget.retained += allocation
        }
        const current = chunks[chunks.length - 1]
        const used = size - (capacity - current.length)
        const copied = Math.min(take - offset, current.length - used)
        chunk.copy(current, used, offset, offset + copied)
        size += copied
        offset += copied
      }
      return true
    },
    finish(incomplete: boolean) {
      finished = true
      budget.retained -= capacity
      return { ...encodeBody(Buffer.concat(chunks, size)), retainedBytes: size, truncated, incomplete }
    },
  }
}
