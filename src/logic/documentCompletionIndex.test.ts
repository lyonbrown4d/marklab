import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'

describe('DocumentCompletionIndex', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('extracts Chinese continuation text from structured Markdown', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild(`# 今日计划

- 我今天打算整理书桌并完成周报
- 明天打算复盘本周任务`)

    expect(index.query('我今天打算')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'document', text: '整理书桌并完成周报' }),
      ]),
    )
  })

  it('uses the trailing English phrase and returns only its remaining continuation', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild(`## Plans

I plan to review the notes before lunch.

We can discuss the result tomorrow.`)

    expect(index.query('Unrelated sentence. I plan to')[0]).toMatchObject({
      source: 'document',
      text: ' review the notes before lunch.',
    })
  })

  it('deduplicates continuations and combines frequency into ranking', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild(`- Project plan includes research

Project plan includes research.

Project plan includes research.

Project plan includes writing.`)

    const candidates = index.query('Project plan includes')
    expect(candidates.map(({ text }) => text)).toEqual([' research', ' writing.'])
  })

  it('prioritizes exact structured matches over fuzzy prose matches', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild(`# Release checklist ready

- Release checklist verify installers

The release check list may change later.`)

    const candidates = index.query('Release checklist')

    expect(candidates[0]?.text).toBe(' verify installers')
  })

  it('indexes link labels and tags', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild('See [Project Atlas](./atlas.md) for details. #roadmap-ready')

    expect(index.query('Project')[0]?.text).toBe(' Atlas')
    expect(index.query('#road')[0]?.text).toBe('map-ready')
  })

  it('splits adjacent Chinese sentences without whitespace', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild('第一句包含计划。第二句包含复盘。')

    expect(index.size).toBe(3)
    expect(index.query('第二句')[0]?.text).toBe('包含复盘。')
  })

  it('uses cursor proximity to rank otherwise equal entries', () => {
    const index = new DocumentCompletionIndex()
    const markdown = `Continue with the distant option.

Some unrelated content.

Continue with the nearby option.`
    index.rebuild(markdown)
    expect(index.query('Continue with the', markdown.length)[0]?.text).toBe(' nearby option.')
  })

  it('keeps continuations inside the active Markdown heading group', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild(`Project plan includes setting up the workspace.

# Work

Project plan includes reviewing the release.

# Personal

Project plan includes buying groceries.`)

    expect(index.query('Project plan includes', undefined, { heading: 'Work' })).toEqual([
      expect.objectContaining({ text: ' reviewing the release.' }),
    ])
    expect(index.query('Project plan includes', undefined, { heading: null })).toEqual([
      expect.objectContaining({ text: ' setting up the workspace.' }),
    ])
    expect(index.query('buying', undefined, { heading: 'Work' })).toEqual([])
  })

  it('infers the active Markdown group from the cursor offset', () => {
    const markdown = `Preamble continues with setup notes.

# Work

Project plan includes reviewing the release.

# Personal

Project plan includes buying groceries.`
    const index = new DocumentCompletionIndex()
    index.rebuild(markdown)
    expect(index.query('Project plan includes', markdown.indexOf('# Personal') - 1)[0]?.text).toBe(
      ' reviewing the release.',
    )
    expect(index.query('Preamble continues', 10)[0]?.text).toBe(' with setup notes.')
  })

  it('searches the active section before applying the result limit', () => {
    const unrelated = Array.from(
      { length: 100 },
      (_, item) => `Project plan includes unrelated option ${item}`,
    ).join('\n')
    const index = new DocumentCompletionIndex({ maxEntries: 200 })
    index.rebuild(`# Other\n${unrelated}\n\n# Work\nProject plan includes the release checklist.`)

    expect(index.query('Project plan includes', undefined, { heading: 'Work' })[0]?.text).toBe(
      ' the release checklist.',
    )
  })

  it('returns no candidate when the trailing prefix does not match', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild('A completely unrelated paragraph.')

    expect(index.query('量子火箭发射')).toEqual([])
  })

  it('does not turn a fuzzy phrase match into an unrelated continuation', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild('The release check list may change later.')

    expect(index.query('Release checklist')).toEqual([])
  })

  it('limits entry count, candidate count, and candidate length', () => {
    const index = new DocumentCompletionIndex({
      maxCandidateLength: 12,
      maxCandidates: 2,
      maxEntries: 4,
    })
    index.rebuild(
      Array.from(
        { length: 20 },
        (_, item) => `Topic ${String.fromCharCode(65 + item)} continues with a long option`,
      ).join('\n\n'),
    )

    const candidates = index.query('Topic')
    expect(index.size).toBeLessThanOrEqual(4)
    expect(candidates).toHaveLength(2)
    expect(candidates.every(({ text }) => text.length <= 12)).toBe(true)
  })

  it('debounces rebuilds and ignores an older document version', async () => {
    const index = new DocumentCompletionIndex({ rebuildDelayMs: 40 })
    index.scheduleRebuild('Draft continues with stale text', 1)
    index.scheduleRebuild('Draft continues with current text', 2)
    index.scheduleRebuild('Draft continues with old text', 1)
    expect(index.query('Draft continues with')).toEqual([])
    await vi.advanceTimersByTimeAsync(40)

    expect(index.query('Draft continues with')[0]?.text).toBe(' current text')
    index.destroy()
  })

  it('finds Chinese, English, and mixed query anchors', () => {
    const index = new DocumentCompletionIndex()
    index.rebuild('Release计划面向AI users and reviewers.')

    expect(index.query('Release计划')[0]?.text).toBe('面向AI users and reviewers.')
    expect(index.query('计划面向AI')[0]?.text).toBe(' users and reviewers.')
    expect(index.query('AI users')[0]?.text).toBe(' and reviewers.')
  })

  it('makes replaceBlocks equivalent to rebuilding the joined document', () => {
    const blocks = [
      { id: 'heading', text: '# Work' },
      { id: 'first', text: 'Project plan includes reviewing the release.' },
      { id: 'second', text: 'Another useful sentence.' },
    ]
    const rebuilt = new DocumentCompletionIndex()
    const replaced = new DocumentCompletionIndex()
    rebuilt.rebuild(blocks.map(({ text }) => text).join('\n'), 4)
    replaced.replaceBlocks(blocks, 4)
    expect(replaced.query('Project plan includes', undefined, { heading: 'Work' })).toEqual(
      rebuilt.query('Project plan includes', undefined, { heading: 'Work' }),
    )
    expect(replaced.size).toBe(rebuilt.size)
  })

  it('upserts and removes blocks without retaining old candidates', () => {
    const index = new DocumentCompletionIndex()
    index.replaceBlocks([{ id: 'draft', text: 'Draft continues with stale text' }], 1)

    expect(
      index.applyBlockBatch(
        [{ type: 'upsert', block: { id: 'draft', text: 'Draft continues with current text' } }],
        2,
      ),
    ).toBe(true)
    expect(index.query('Draft continues with')[0]?.text).toBe(' current text')
    expect(index.query('stale text')).toEqual([])
    expect(index.applyBlockBatch([{ type: 'remove', id: 'draft' }], 3)).toBe(true)
    expect(index.query('Draft continues with')).toEqual([])
  })

  it('rejects stale incremental batches without changing the index', () => {
    const index = new DocumentCompletionIndex()
    index.replaceBlocks([{ id: 'draft', text: 'Draft continues with current text' }], 5)

    expect(
      index.applyBlockBatch(
        [{ type: 'upsert', block: { id: 'draft', text: 'Draft continues with stale text' } }],
        4,
      ),
    ).toBe(false)
    expect(index.query('Draft continues with')[0]?.text).toBe(' current text')
  })

  it('keeps recent entries when maxEntries is constrained', () => {
    const index = new DocumentCompletionIndex({ maxEntries: 2 })
    index.replaceBlocks(
      [
        { id: 'old', text: 'Choice continues with old text' },
        { id: 'middle', text: 'Choice continues with middle text' },
        { id: 'recent', text: 'Choice continues with recent text' },
      ],
      1,
    )

    expect(index.query('Choice continues with').map(({ text }) => text)).toContain(' recent text')
    expect(index.query('Choice continues with').map(({ text }) => text)).not.toContain(' old text')
  })

  it('uses heading metadata and a block-local cursor for scope and proximity', () => {
    const index = new DocumentCompletionIndex()
    index.replaceBlocks([
      { id: 'heading', kind: 'heading', order: 0, text: 'Work' },
      { id: 'far', order: 1, text: 'Continue with the distant option.' },
      { id: 'padding', order: 2, text: 'Unrelated padding content.' },
      { id: 'near', order: 3, text: 'Continue with the nearby option.' },
    ])

    expect(index.query('Continue with the', undefined, { blockId: 'near' })[0]?.text).toBe(
      ' nearby option.',
    )
    expect(index.resolveBlockOffset('near', 2)).toBeGreaterThan(
      index.resolveBlockOffset('far') ?? 0,
    )
  })

  it('retains the active section when context truncation removes its heading', () => {
    const body = 'Project plan includes reviewing the release.'
    const markdown = `# Work\n${body}`
    const index = new DocumentCompletionIndex({ maxContextLength: body.length })
    index.rebuild(markdown)

    expect(index.query('Project plan includes', markdown.length)[0]?.text).toBe(
      ' reviewing the release.',
    )
  })
})
