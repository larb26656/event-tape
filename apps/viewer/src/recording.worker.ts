import { parseRecordingJsonl } from '@event-tape/recording-format/src/index.ts'


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
      try {
        self.postMessage(parseRecordingJsonl(contents))
      } catch (error) {
        self.postMessage({ error: String(error) })
      }
    },
    (error: unknown) => self.postMessage({ error: String(error) }),
  )
}
