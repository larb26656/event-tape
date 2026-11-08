import { describe, expect, it } from 'vitest'
import { createLineParser } from './lines.js'

function parser(skipping = false) {
  const lines: { text: string, partial: boolean }[] = []
  return { lines, ...createLineParser(skipping, (text, partial) => lines.push({ text, partial })) }
}

describe('file line parser', () => {
  it('handles chunk boundaries, empty lines and partial generations', () => {
    const p = parser()
    p.add(Buffer.from('first\r'))
    p.add(Buffer.from('\n\nlast\r'))
    p.finishGeneration()
    p.add(Buffer.from('next\n'))
    p.finishGeneration()
    expect(p.lines).toEqual([
      { text: 'first', partial: false },
      { text: '', partial: false },
      { text: 'last\r', partial: true },
      { text: 'next', partial: false },
    ])
  })

  it('skips an initial fragment across chunks and resets at a generation boundary', () => {
    const p = parser(true)
    p.add(Buffer.from('ignored'))
    p.add(Buffer.from(' too\nkept\nfragment'))
    p.finishGeneration()
    expect(p.lines).toEqual([{ text: 'kept', partial: false }, { text: 'fragment', partial: true }])
    const other = parser(true)
    other.add(Buffer.from('ignored'))
    other.finishGeneration()
    other.add(Buffer.from('new\n'))
    expect(other.lines).toEqual([{ text: 'new', partial: false }])
  })

  it('decodes split UTF-8 and preserves a BOM', () => {
    const p = parser()
    const bytes = Buffer.from('\ufeffa😀\n')
    for (const byte of bytes) p.add(Buffer.from([byte]))
    expect(p.lines).toEqual([{ text: '\ufeffa😀', partial: false }])
  })

  it('rejects invalid and incomplete UTF-8', () => {
    const invalid = parser()
    expect(() => invalid.add(Buffer.from([0xff]))).toThrow()
    const incomplete = parser()
    incomplete.add(Buffer.from([0xe2, 0x82]))
    expect(() => incomplete.finishGeneration()).toThrow()
  })

  it('enforces the byte limit, allowing a CR only before LF', () => {
    const max = 1_048_576
    const exact = parser()
    exact.add(Buffer.alloc(max, 97))
    exact.add(Buffer.from('\r'))
    exact.add(Buffer.from('\n'))
    expect(exact.lines).toEqual([{ text: 'a'.repeat(max), partial: false }])
    const partial = parser()
    partial.add(Buffer.alloc(max, 97))
    partial.add(Buffer.from('\r'))
    expect(() => partial.finishGeneration()).toThrow(`line exceeds ${max} bytes`)
    const long = parser()
    long.add(Buffer.alloc(max, 97))
    expect(() => long.add(Buffer.from('a'))).toThrow(`line exceeds ${max} bytes`)
    const multibyte = parser()
    multibyte.add(Buffer.alloc(max - 1, 97))
    expect(() => multibyte.add(Buffer.from('é'))).toThrow(`line exceeds ${max} bytes`)
  })
})
