import { describe, expect, it, vi } from 'vitest'
import { createWritePipeline } from './write-pipeline.js'

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

async function settleDispatch() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('WritePipeline', () => {
  it('defers dispatch, preserves FIFO without overlap, and permits callback enqueue', async () => {
    const first = deferred()
    const writes: number[] = []
    let active = 0
    let maximumActive = 0
    const pipelineRef: { enqueueThird?: () => void } = {}
    const writer = {
      write: vi.fn(async (item: number) => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        writes.push(item)
        if (item === 1) pipelineRef.enqueueThird?.()
        if (item === 1) await first.promise
        active -= 1
      }),
      close: vi.fn(),
    }
    const pipeline = createWritePipeline(writer, 5)
    pipelineRef.enqueueThird = () => pipeline.enqueue(3, 1)
    pipeline.enqueue(1, 2)
    pipeline.enqueue(2, 2)
    expect(writes).toEqual([])
    await settleDispatch()
    expect(writes).toEqual([1])
    first.resolve()
    await pipeline.close()
    expect(writes).toEqual([1, 2, 3])
    expect(maximumActive).toBe(1)
    expect(writer.close).toHaveBeenCalledTimes(1)
  })

  it('accepts exact capacity, counts in-flight work, recovers capacity after settlement, and preserves work on overflow', async () => {
    const heldGate = deferred()
    const queuedGate = deferred()
    const heldStarted = deferred()
    const queuedStarted = deferred()
    const writes: string[] = []
    const writer = {
      write: vi.fn(async (item: string) => {
        writes.push(item)
        if (item === 'held') {
          heldStarted.resolve()
          await heldGate.promise
        }
        if (item === 'queued') {
          queuedStarted.resolve()
          await queuedGate.promise
        }
      }),
      close: vi.fn(),
    }
    const pipeline = createWritePipeline(writer, 5)
    pipeline.enqueue('held', 3)
    pipeline.enqueue('queued', 2)
    await heldStarted.promise
    expect(() => pipeline.enqueue('overflow', 1)).toThrow(/buffer limit/)
    expect(writes).toEqual(['held'])
    heldGate.resolve()
    await queuedStarted.promise
    pipeline.enqueue('recovered', 3)
    expect(() => pipeline.enqueue('overflow', 1)).toThrow(/buffer limit/)
    expect(writes).toEqual(['held', 'queued'])
    queuedGate.resolve()
    await pipeline.close()
    expect(writes).toEqual(['held', 'queued', 'recovered'])
  })

  const failureCases: Array<
    [
      string,
      (failure: Error) => {
        write(item: string): void | Promise<void>
        close(): void
      },
    ]
  > = [
    [
      'synchronous throw',
      (failure) => ({
        write: vi.fn(() => {
          throw failure
        }),
        close: vi.fn(),
      }),
    ],
    [
      'asynchronous rejection',
      (failure) => ({
        write: vi.fn(() => Promise.reject(failure)),
        close: vi.fn(),
      }),
    ],
  ]
  it.each(failureCases)(
    'latches first write failure on %s, skips queued items, and reports once',
    async (_name, makeWriter) => {
      const failure = new Error('first failure')
      const onError = vi.fn()
      const writer = makeWriter(failure)
      const pipeline = createWritePipeline(writer, 10, onError)
      pipeline.enqueue('first', 1)
      pipeline.enqueue('second', 1)
      const closing = pipeline.close()
      await expect(closing).rejects.toBe(failure)
      expect(pipeline.close()).toBe(closing)
      expect(() => pipeline.assertAccepting()).toThrow(failure)
      expect(writer.write).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(failure)
    },
  )

  it('normalizes non-Error write failures and ignores a throwing error callback', async () => {
    const onError = vi.fn((error: Error) => {
      expect(error).toBeInstanceOf(Error)
      throw new Error('callback failure')
    })
    const writer = {
      write: vi.fn(() => Promise.reject('write reason')),
      close: vi.fn(),
    }
    const pipeline = createWritePipeline(writer, 2, onError)
    pipeline.enqueue('item', 1)
    await expect(pipeline.close()).rejects.toThrow('write reason')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(writer.close).toHaveBeenCalledTimes(1)
  })

  it('stops admission immediately, drains accepted work, closes once, and returns a stable promise', async () => {
    const gate = deferred()
    const order: string[] = []
    const writer = {
      write: vi.fn(async () => {
        order.push('write-start')
        await gate.promise
        order.push('write-end')
      }),
      close: vi.fn(() => {
        order.push('close')
      }),
    }
    const pipeline = createWritePipeline(writer, 1)
    pipeline.enqueue('item', 1)
    const closing = pipeline.close()
    expect(pipeline.close()).toBe(closing)
    expect(() => pipeline.enqueue('late', 0)).toThrow(/closed/)
    await settleDispatch()
    expect(order).toEqual(['write-start'])
    gate.resolve()
    await closing
    expect(order).toEqual(['write-start', 'write-end', 'close'])
    expect(writer.close).toHaveBeenCalledTimes(1)
    expect(pipeline.close()).toBe(closing)
  })

  it('keeps the first write error authoritative over cleanup failure', async () => {
    const failure = new Error('write failure')
    const writer = {
      write() {
        throw failure
      },
      close() {
        throw new Error('cleanup failure')
      },
    }
    const pipeline = createWritePipeline(writer, 1)
    pipeline.enqueue('item', 1)
    await expect(pipeline.close()).rejects.toBe(failure)
  })

  it('preserves cleanup-only rejection reasons including undefined', async () => {
    for (const reason of [new Error('cleanup failure'), undefined]) {
      const pipeline = createWritePipeline(
        {
          write() {},
          close() {
            return Promise.reject(reason)
          },
        },
        1,
      )
      await expect(pipeline.close()).rejects.toBe(reason)
    }
  })
})
