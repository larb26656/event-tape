import type { RecordingEnvelope } from '@event-tape/recording-format'

export interface Writer {
  write(event: RecordingEnvelope): void | Promise<void>
  close(): void | Promise<void>
}
