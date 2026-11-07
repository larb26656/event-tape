import {
  parseEnvelope,
  type RecordingEnvelope,
} from '@event-tape/recording-format/src/index.ts'

self.onmessage = (
  event: MessageEvent<File | { file?: File; text?: string }>,
) => {
  const data = event.data
  const input =
    data instanceof File
      ? data
      : data && typeof data === 'object' && 'file' in data
        ? data.file
        : undefined
  const text =
    data &&
    typeof data === 'object' &&
    'text' in data &&
    typeof data.text === 'string'
      ? data.text
      : ''
  const load = input ? input.text() : Promise.resolve(text)
  void load.then(
    (contents) => {
      const lines = contents.split('\n')
      const events: RecordingEnvelope[] = []
      for (let index = 0; index < lines.length; index++) {
        if (!lines[index]?.trim()) continue
        try {
          events.push(parseEnvelope(JSON.parse(lines[index])))
        } catch (error) {
          self.postMessage({
            error: `Line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          })
          return
        }
      }
      self.postMessage({ events })
    },
    (error: unknown) => self.postMessage({ error: String(error) }),
  )
}
