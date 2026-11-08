const MAX_LINE = 1_048_576

export function createLineParser(skipping: boolean, record: (text: string, partial: boolean) => void) {
  let pending: string[] = []
  let length = 0
  let lastByte: number | undefined
  let decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const emit = (partial: boolean) => {
    if (length > MAX_LINE && (partial || lastByte !== 13)) throw new Error(`line exceeds ${MAX_LINE} bytes`)
    pending.push(decoder.decode())
    let text = pending.join('')
    if (!partial && lastByte === 13) text = text.slice(0, -1)
    record(text, partial)
    pending = []
    length = 0
    lastByte = undefined
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  }
  const add = (chunk: Buffer) => {
    let start = 0
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start)
      const end = newline < 0 ? chunk.length : newline
      if (!skipping) {
        const part = chunk.subarray(start, end)
        if (part.length) {
          length += part.length
          lastByte = part.at(-1)
        }
        if (length > MAX_LINE + 1 || (length === MAX_LINE + 1 && lastByte !== 13))
          throw new Error(`line exceeds ${MAX_LINE} bytes`)
        if (part.length) pending.push(decoder.decode(part, { stream: true }))
        if (newline >= 0) emit(false)
      } else if (newline >= 0) skipping = false
      if (newline < 0) break
      start = newline + 1
    }
  }
  const finishGeneration = () => {
    if (!skipping && length) emit(true)
    skipping = false
  }
  return { add, finishGeneration }
}
