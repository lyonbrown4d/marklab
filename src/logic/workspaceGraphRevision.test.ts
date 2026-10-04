import { describe, expect, it } from 'vitest'
import {
  createWorkspaceGraphRevision,
  createWorkspaceGraphStructureRevision,
} from '@/logic/workspaceGraphRevision'
import type { FsWorkspaceIndex } from '@/services/fsApi'

const createIndex = (): FsWorkspaceIndex => ({
  files: [
    {
      path: 'docs/source.md',
      headings: [{ path: 'docs/source.md', level: 2, text: 'Topic', slug: 'topic', line: 3 }],
      links: [
        {
          source_path: 'docs/source.md',
          text: 'Target',
          target: './target.md#section',
          link_type: 'markdown',
          target_path: 'docs/target.md',
          target_anchor: 'section',
          target_heading_slug: 'section',
          is_external: false,
          context: 'Target',
          line: 6,
          column: 1,
        },
      ],
      assets: [
        {
          source_path: 'docs/source.md',
          target: './image.png',
          target_path: 'docs/image.png',
          is_external: false,
          context: 'image',
          line: 8,
          column: 1,
        },
      ],
    },
  ],
})

describe('createWorkspaceGraphRevision', () => {
  it('is stable for equivalent workspace graph semantics', () => {
    expect(createWorkspaceGraphRevision(createIndex())).toBe(
      createWorkspaceGraphRevision(createIndex()),
    )
  })

  it.each([
    ['file path', (index: FsWorkspaceIndex) => (index.files[0].path = 'docs/renamed.md')],
    [
      'heading identity',
      (index: FsWorkspaceIndex) => (index.files[0].headings[0].slug = 'renamed'),
    ],
    ['link target', (index: FsWorkspaceIndex) => (index.files[0].links[0].target = './other.md')],
    [
      'link target path',
      (index: FsWorkspaceIndex) => (index.files[0].links[0].target_path = 'docs/other.md'),
    ],
    ['link anchor', (index: FsWorkspaceIndex) => (index.files[0].links[0].target_anchor = 'other')],
    [
      'link heading slug',
      (index: FsWorkspaceIndex) => (index.files[0].links[0].target_heading_slug = 'other'),
    ],
    ['asset target', (index: FsWorkspaceIndex) => (index.files[0].assets![0].target = './new.png')],
    [
      'asset target path',
      (index: FsWorkspaceIndex) => (index.files[0].assets![0].target_path = 'docs/new.png'),
    ],
  ])('changes when the %s changes without changing counts', (_label, mutate) => {
    const before = createIndex()
    const after = createIndex()
    mutate(after)

    expect(createWorkspaceGraphRevision(after)).not.toBe(createWorkspaceGraphRevision(before))
  })

  it.each([
    ['known path', 'paths' as const, 'docs/new.md'],
    ['known asset path', 'asset_paths' as const, 'docs/new.png'],
  ])('changes when a %s changes', (_label, field, value) => {
    const before = createIndex()
    const after = createIndex()
    before[field] = []
    after[field] = [value]

    expect(createWorkspaceGraphRevision(after)).not.toBe(createWorkspaceGraphRevision(before))
  })
})

describe('createWorkspaceGraphStructureRevision', () => {
  it('changes for path topology but ignores document-only semantic changes', () => {
    const before = createIndex()
    const contentOnly = createIndex()
    contentOnly.files[0].headings[0].text = 'Changed title'
    const renamed = createIndex()
    renamed.files[0].path = 'docs/renamed.md'

    expect(createWorkspaceGraphStructureRevision(contentOnly)).toBe(
      createWorkspaceGraphStructureRevision(before),
    )
    expect(createWorkspaceGraphStructureRevision(renamed)).not.toBe(
      createWorkspaceGraphStructureRevision(before),
    )
  })
})
