import { describe, expect, it } from 'vitest'
import {
  conflictChoiceContent,
  hasConflictMarkers,
  parseConflictMarkers,
} from '@/features/git/conflicts/conflictMarkers'

const normal = 'prefix\n<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> feature\nsuffix\n'

describe('Git conflict marker parser', () => {
  it('parses normal markers with exact offsets and preserves outside context for each choice', () => {
    const [block] = parseConflictMarkers(normal)
    expect(block).toEqual({
      start: 7,
      end: normal.indexOf('suffix'),
      line: 2,
      ours: 'current\n',
      theirs: 'incoming\n',
      base: null,
    })
    for (const [choice, expected] of [
      ['ours', 'current\n'],
      ['theirs', 'incoming\n'],
      ['both', 'current\nincoming\n'],
    ] as const) {
      const resolved =
        normal.slice(0, block!.start) +
        conflictChoiceContent(block!, choice) +
        normal.slice(block!.end)
      expect(resolved).toBe(`prefix\n${expected}suffix\n`)
      expect(hasConflictMarkers(resolved)).toBe(false)
    }
  })

  it.each(['diff3', 'zdiff3'])('supports %s with common context outside the block', () => {
    const content =
      'shared prefix\n<<<<<<< current\nours\n||||||| ancestor\nbase\n=======\ntheirs\n>>>>>>> incoming\nshared suffix\n'
    const [block] = parseConflictMarkers(content)
    expect(block?.ours).toBe('ours\n')
    expect(block?.base).toBe('base\n')
    expect(block?.theirs).toBe('theirs\n')
    expect(content.slice(0, block!.start)).toBe('shared prefix\n')
    expect(content.slice(block!.end)).toBe('shared suffix\n')
  })

  it('handles multiple conflicts, CRLF, empty sides and a closing marker without a final newline', () => {
    const content =
      '<<<<<<< ours\r\n=======\r\nnew\r\n>>>>>>> theirs\r\nbridge\r\n<<<<<<< ours\r\nold\r\n=======\r\n>>>>>>> theirs'
    const blocks = parseConflictMarkers(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.ours).toBe('')
    expect(blocks[0]?.theirs).toBe('new\r\n')
    expect(blocks[1]?.ours).toBe('old\r\n')
    expect(blocks[1]?.theirs).toBe('')
    expect(blocks[1]?.end).toBe(content.length)
  })

  it('keeps malformed/unclosed markers unresolved without offering a destructive choice', () => {
    for (const content of [
      '<<<<<<< ours\ntext\n',
      '<<<<<<< ours\n=======\ntheirs\n',
      '<<<<<<< ours\n>>>>>> theirs\n',
      '||||||| base\n',
      '=======\n',
    ]) {
      expect(parseConflictMarkers(content)).toEqual([])
      expect(hasConflictMarkers(content)).toBe(true)
    }
  })

  it('does not treat ordinary code operators or inline strings as marker blocks', () => {
    const source = 'const less = a << b;\nconst marker = "<<<<<<< HEAD";\n<component />\n====\n'
    expect(parseConflictMarkers(source)).toEqual([])
    expect(hasConflictMarkers(source)).toBe(false)
  })

  it('handles configured four-character markers and the standard fallback', () => {
    const small = '<<<< ours\ncurrent\n|||| base\noriginal\n====\nincoming\n>>>> theirs\n'
    expect(parseConflictMarkers(small, 4)[0]).toMatchObject({
      ours: 'current\n',
      base: 'original\n',
      theirs: 'incoming\n',
    })
    expect(hasConflictMarkers(small, 4)).toBe(true)
    expect(hasConflictMarkers(small)).toBe(false)
    expect(hasConflictMarkers(normal, 4)).toBe(true)
    expect(parseConflictMarkers(normal, 4)).toHaveLength(1)
  })

  it('skips marker widths above the backend limit without allocating large dynamic patterns', () => {
    const giant = '<'.repeat(2048) + ' current\n'
    expect(parseConflictMarkers(giant, 2048)).toEqual([])
    expect(parseConflictMarkers(giant + normal)).toHaveLength(1)
    expect(parseConflictMarkers(normal.replace('current\n', giant + 'current\n'))).toHaveLength(1)
  })

  it('supports larger configured widths and rejects nested broken blocks while finding the next valid one', () => {
    const large = normal.replace(/<<<<<<<|=======|>>>>>>>/g, (marker) => marker[0]!.repeat(12))
    expect(parseConflictMarkers(large, 12)).toHaveLength(1)
    const nested = `<<<<<<< broken\nunresolved\n${normal}`
    expect(parseConflictMarkers(nested)).toHaveLength(1)
    expect(hasConflictMarkers('text\n', NaN)).toBe(false)
    expect(hasConflictMarkers(normal, -1)).toBe(true)
  })
})
