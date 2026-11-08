import type { Recorder } from '@event-tape/sdk'
import type { Command } from 'commander'

export interface RunningHandler {
  address: string
  stop(): Promise<void>
  forceStop(): void
}

export interface HandlerDefinition<T> {
  name: string
  description: string
  presets: Readonly<Record<string, Record<string, unknown>>>
  configureOptions(command: Command): void
  resolve(options: Record<string, unknown>, overrides: Record<string, unknown>): T
  start(options: T, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningHandler>
}
