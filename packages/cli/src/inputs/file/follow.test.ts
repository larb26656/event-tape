import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { startFile } from './follow.js'

describe('file follower', () => {
  it('drains from the initial position through the shutdown boundary', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'event-tape-file-follow-'))
    try {
      const path = join(dir, 'input.log')
      await writeFile(path, 'old fragment')
      const record = vi.fn()
      const fatal = vi.fn()
      const follower = await startFile(path, { paths: [path], fromStart: false }, { record, close: async () => {} }, fatal)
      await appendFile(path, ' ignored\nnew\ntail')
      await follower.stop()
      expect(record.mock.calls.map(([event]) => event.payload)).toEqual([
        { path, text: 'new', partial: false },
        { path, text: 'tail', partial: true },
      ])
      expect(fatal).not.toHaveBeenCalled()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records complete JSON as values and other lines as text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'event-tape-file-follow-'))
    try {
      const path = join(dir, 'input.log')
      await writeFile(path, '{"level":"info"}\n[true,null]\n9007199254740993\n{"broken":\nplain text\n123')
      const record = vi.fn()
      const follower = await startFile(path, { paths: [path], fromStart: true }, { record, close: async () => {} }, vi.fn())
      await follower.stop()
      expect(record.mock.calls.map(([event]) => event.payload)).toEqual([
        { path, json: { level: 'info' }, partial: false },
        { path, json: [true, null], partial: false },
        { path, json: 9007199254740992, partial: false },
        { path, text: '{"broken":', partial: false },
        { path, text: 'plain text', partial: false },
        { path, text: '123', partial: true },
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
