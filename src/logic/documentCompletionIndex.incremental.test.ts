import Fuse from 'fuse.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import { createDocumentCompletionTokenizer } from '@/logic/documentCompletionTokenizer'

describe('DocumentCompletionIndex incremental updates', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('updates one block without reanalyzing stable blocks or rebuilding Fuse collections', () => {
    const baseTokenizer = createDocumentCompletionTokenizer()
    const analyze = vi.fn((text: string) => baseTokenizer.analyze(text))
    const index = new DocumentCompletionIndex({ tokenizer: { analyze } })
    const blocks = Array.from({ length: 2_000 }, (_, blockIndex) => ({
      id: `block-${blockIndex}`,
      text: `Topic ${blockIndex} continues with the original detail.`,
    }))
    index.replaceBlocks(blocks, 1)
    analyze.mockClear()
    const setCollection = vi.spyOn(Fuse.prototype, 'setCollection')

    index.applyBlockBatch(
      [
        {
          block: {
            id: 'block-1900',
            text: 'Unique anchor continues with the current detail.',
          },
          type: 'upsert',
        },
      ],
      2,
    )

    expect(analyze).toHaveBeenCalledOnce()
    expect(setCollection).not.toHaveBeenCalled()
    expect(index.query('Unique anchor continues with')[0]?.text).toBe(' the current detail.')
    expect(index.query('Topic 1900 continues with')).toEqual([])
  })

  it('moves inherited entries when an upsert changes their section', () => {
    const index = new DocumentCompletionIndex()
    index.replaceBlocks(
      [
        { id: 'work-heading', kind: 'heading', text: 'Work' },
        { id: 'work-entry', text: 'Project plan includes reviewing the release.' },
        { id: 'personal-heading', kind: 'heading', text: 'Personal' },
        { id: 'personal-entry', text: 'Project plan includes buying groceries.' },
      ],
      1,
    )

    index.applyBlockBatch(
      [{ block: { id: 'work-heading', kind: 'heading', text: 'Archive' }, type: 'upsert' }],
      2,
    )

    expect(index.query('Project plan includes', undefined, { heading: 'Archive' })[0]?.text).toBe(
      ' reviewing the release.',
    )
    expect(index.query('Project plan includes', undefined, { heading: 'Work' })).toEqual([])
    expect(index.query('Project plan includes', undefined, { heading: 'Personal' })[0]?.text).toBe(
      ' buying groceries.',
    )
  })

  it('moves inherited entries to the root section when their heading is removed', () => {
    const index = new DocumentCompletionIndex()
    index.replaceBlocks(
      [
        { id: 'heading', kind: 'heading', text: 'Work' },
        { id: 'entry', text: 'Project plan includes reviewing the release.' },
      ],
      1,
    )

    index.applyBlockBatch([{ id: 'heading', type: 'remove' }], 2)

    expect(index.query('Project plan includes', undefined, { heading: null })[0]?.text).toBe(
      ' reviewing the release.',
    )
    expect(index.query('Project plan includes', undefined, { heading: 'Work' })).toEqual([])
  })

  it('cancels a scheduled rebuild when destroyed', async () => {
    const index = new DocumentCompletionIndex({ rebuildDelayMs: 20 })
    index.scheduleRebuild('Draft continues after destruction.', 1)

    index.destroy()
    await vi.advanceTimersByTimeAsync(20)

    expect(index.query('Draft continues')).toEqual([])
  })
})
