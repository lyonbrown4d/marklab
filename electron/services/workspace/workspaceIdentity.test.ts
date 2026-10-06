import { describe, expect, it } from 'vitest'

import {
  canonicalWorkspacePath,
  createWorkspaceStorageKey,
} from '@electron/services/workspace/workspaceIdentity'

describe('workspace identity', () => {
  it('normalizes Windows separators, casing, Unicode, and trailing separators', () => {
    expect(canonicalWorkspacePath('C:\\Notes\\Cafe\u0301\\', 'win32')).toBe('c:/notes/café')
    expect(canonicalWorkspacePath('c:/NOTES/Café', 'win32')).toBe('c:/notes/café')
  })

  it('normalizes macOS Unicode and casing while preserving Linux casing', () => {
    expect(canonicalWorkspacePath('/Users/A/Cafe\u0301/', 'darwin')).toBe('/users/a/café')
    expect(canonicalWorkspacePath('/home/A/Notes/', 'linux')).toBe('/home/A/Notes')
  })

  it('creates a kind-scoped storage key and rejects relative paths', () => {
    expect(createWorkspaceStorageKey({ kind: 'external', path: '/Notes' }, 'linux')).toBe(
      'external:/Notes',
    )
    expect(() => canonicalWorkspacePath('relative/notes', 'linux')).toThrow('absolute')
  })
})
