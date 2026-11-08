import { close as closeCallback, mkdirSync, openSync, write as writeCallback } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { RecordingEnvelope } from '@event-tape/recording-format'
import type { Writer } from './writer.js'

export interface FileWriterOptions {
  file: string
}

export function createFileWriter({ file }: FileWriterOptions): Writer {
  const target = resolve(file)
  mkdirSync(dirname(target), { recursive: true })
  const descriptor = openSync(target, 'wx')
  let closePromise: Promise<void> | undefined

  return {
    write(event: RecordingEnvelope): Promise<void> {
      return writeAll(descriptor, Buffer.from(`${JSON.stringify(event)}\n`))
    },
    close(): Promise<void> {
      closePromise ??= closeDescriptor(descriptor)
      return closePromise
    },
  }
}

function writeAll(descriptor: number, bytes: Buffer): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    let offset = 0
    const writeNext = () => {
      writeCallback(descriptor, bytes, offset, bytes.length - offset, null, (error, bytesWritten) => {
        if (error) { rejectWrite(error); return }
        if (bytesWritten <= 0) { rejectWrite(new Error('file write made no progress')); return }
        offset += bytesWritten
        if (offset < bytes.length) writeNext()
        else resolveWrite()
      })
    }
    writeNext()
  })
}

function closeDescriptor(descriptor: number): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    closeCallback(descriptor, (error) => error ? rejectClose(error) : resolveClose())
  })
}
