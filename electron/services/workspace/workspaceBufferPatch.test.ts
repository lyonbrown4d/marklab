import { describe, expect, it } from 'vitest'
import {
  MAX_BUFFER_PATCH_CHANGES,
  MAX_BUFFER_PATCH_INSERTED_CHARS,
  MAX_BUFFER_SNAPSHOT_CHARS,
  applyWorkspaceBufferChanges,
  parseWorkspaceBufferUpdate,
} from '@electron/services/workspace/workspaceBufferPatch'

describe('workspace buffer patches', () => {
  it('applies multiple changes against the same base snapshot', () => {
    expect(
      applyWorkspaceBufferChanges('abcdef', [
        { offset: 1, delete_length: 2, insert_text: 'X' },
        { offset: 5, delete_length: 1, insert_text: 'YZ' },
      ]),
    ).toBe('aXdeYZ')
  })

  it('rejects changes that extend beyond the base snapshot', () => {
    expect(() =>
      applyWorkspaceBufferChanges('abc', [{ offset: 2, delete_length: 2, insert_text: '' }]),
    ).toThrow('outside')
  })

  it('strictly rejects invalid revisions and unknown payload fields', () => {
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: -1,
        session_generation: 1,
        update: { kind: 'patch', changes: [] },
      }),
    ).toThrow()
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        session_generation: 1,
        update: { kind: 'patch', changes: [], unexpected: true },
      }),
    ).toThrow()
  })

  it('requires a workspace session generation on every update', () => {
    expect(
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        session_generation: 7,
        update: { kind: 'snapshot', content: 'new' },
      }),
    ).toMatchObject({ session_generation: 7 })
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        update: { kind: 'snapshot', content: 'new' },
      }),
    ).toThrow()
  })

  it('bounds patch count, inserted text, and checkpoints', () => {
    const change = { offset: 0, delete_length: 0, insert_text: '' }
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        session_generation: 1,
        update: {
          kind: 'patch',
          changes: Array.from({ length: MAX_BUFFER_PATCH_CHANGES + 1 }, () => change),
        },
      }),
    ).toThrow()
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        session_generation: 1,
        update: {
          kind: 'patch',
          changes: [{ ...change, insert_text: 'x'.repeat(MAX_BUFFER_PATCH_INSERTED_CHARS + 1) }],
        },
      }),
    ).toThrow()
    expect(() =>
      parseWorkspaceBufferUpdate({
        path: 'note.md',
        base_revision: 0,
        session_generation: 1,
        update: {
          kind: 'snapshot',
          content: 'x'.repeat(MAX_BUFFER_SNAPSHOT_CHARS + 1),
        },
      }),
    ).toThrow()
  })

  it('applies one thousand changes to a large document within a linear-time budget', () => {
    const content = '0123456789'.repeat(400_000)
    const changes = Array.from({ length: MAX_BUFFER_PATCH_CHANGES }, (_, index) => ({
      offset: index * 4_000,
      delete_length: 1,
      insert_text: String(index % 10),
    }))
    const startedAt = performance.now()

    const result = applyWorkspaceBufferChanges(content, changes)

    expect(performance.now() - startedAt).toBeLessThan(250)
    expect(result).toHaveLength(content.length)
    for (const [index, change] of changes.entries()) {
      expect(result.at(change.offset)).toBe(String(index % 10))
    }
  })
})
