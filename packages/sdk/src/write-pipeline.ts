export interface PipelineWriter<T> {
  write(item: T): void | Promise<void>
  close(): void | Promise<void>
}

export interface WritePipeline<T> {
  assertAccepting(): void
  enqueue(item: T, accountedBytes: number): void
  close(): Promise<void>
}

export function createWritePipeline<T>(
  writer: PipelineWriter<T>,
  maxBufferedBytes: number,
  onError?: (error: Error) => void,
): WritePipeline<T> {
  let queue: Promise<void> = Promise.resolve()
  let bufferedBytes = 0
  let failure: Error | undefined
  let hasFailure = false
  let closing = false
  let closePromise: Promise<void> | undefined

  const assertAccepting = () => {
    if (hasFailure) throw failure
    if (closing) throw new Error('recorder is closed')
  }

  return {
    assertAccepting,
    enqueue(item, accountedBytes) {
      assertAccepting()
      if (bufferedBytes + accountedBytes > maxBufferedBytes) {
        throw new Error(
          `recorder buffer limit of ${maxBufferedBytes} bytes exceeded`,
        )
      }
      bufferedBytes += accountedBytes
      queue = queue.then(async () => {
        try {
          if (!hasFailure) await writer.write(item)
        } catch (error) {
          hasFailure = true
          failure = error instanceof Error ? error : new Error(String(error))
          try {
            onError?.(failure)
          } catch {
            /* Keep the write failure authoritative. */
          }
        } finally {
          bufferedBytes -= accountedBytes
        }
      })
    },
    close() {
      if (closePromise) return closePromise
      closing = true
      closePromise = (async () => {
        await queue
        let closeFailed = false
        let closeFailure: unknown
        try {
          await writer.close()
        } catch (error) {
          closeFailed = true
          closeFailure = error
        }
        if (hasFailure) throw failure
        if (closeFailed) throw closeFailure
      })()
      return closePromise
    },
  }
}
