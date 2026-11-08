import type { Recorder } from '@event-tape/sdk'
import type { Command } from 'commander'

export interface RunningInput {
  address?: string
  stop(): Promise<void>
  forceStop(): void
}

export interface InputDefinition<T> {
  name: string
  description: string
  presets: Readonly<Record<string, Record<string, unknown>>>
  configureOptions(command: Command): void
  resolve(options: Record<string, unknown>, overrides: Record<string, unknown>): T
  start(options: T, recorder: Recorder, fatal: (error: Error) => void): Promise<RunningInput>
}

export function createInput<T>(definition: InputDefinition<T>): InputDefinition<T> {
  return definition
}
