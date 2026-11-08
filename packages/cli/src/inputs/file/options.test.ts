import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveOptions } from './options.js'

describe('file options', () => {
  it('resolves paths, defaults fromStart and applies defined overrides', () => {
    expect(resolveOptions({ paths: ['preset'], fromStart: true }, { path: ['first', 'second'], fromStart: undefined })).toEqual({
      paths: [resolve('first'), resolve('second')],
      fromStart: true,
    })
    expect(resolveOptions({ paths: ['file'] }, {})).toEqual({ paths: [resolve('file')], fromStart: false })
  })

  it('rejects unknown options and invalid paths', () => {
    expect(() => resolveOptions({ paths: ['file'], extra: true }, {})).toThrow('unknown file option: extra')
    expect(() => resolveOptions({ paths: [] }, {})).toThrow('paths:')
    expect(() => resolveOptions({ paths: [''] }, {})).toThrow('paths.0:')
  })
})
