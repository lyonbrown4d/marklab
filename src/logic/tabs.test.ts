import { describe, expect, it } from 'vitest'
import {
  areWorkspaceTabsEqual,
  createWebTab,
  getPersistableWorkspaceTabs,
  getWorkspaceTabId,
  normalizeRuntimeWorkspaceTabs,
  normalizeWorkspaceTabId,
  normalizeWorkspaceTabs,
} from '@/logic/tabs'

describe('normalizeWorkspaceTabs', () => {
  it('drops malformed tabs while deduplicating valid tabs', () => {
    const tabs = normalizeRuntimeWorkspaceTabs([
      { kind: 'git-diff' },
      { kind: 'git-diff', path: undefined, section: undefined },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
      { kind: 'file', path: 'README.md' },
      { kind: 'file', path: 'README.md', view: 'source' },
      { kind: 'workspace-graph' },
      { kind: 'file', path: 'legacy.md', view: 'graph' },
      { kind: 'file', path: '' },
    ])

    expect(tabs.map(getWorkspaceTabId)).toEqual([
      'git-diff:unstaged:README.md',
      'file:edit:README.md',
      'file:source:README.md',
    ])
  })
})

describe('normalizeWorkspaceTabId', () => {
  it('falls back to the first available tab when the active id is stale', () => {
    const tabs = normalizeRuntimeWorkspaceTabs([
      { kind: 'file', path: 'README.md' },
      { kind: 'git-diff', path: 'README.md', section: 'unstaged' },
    ])

    expect(normalizeWorkspaceTabId('git-diff:undefined:undefined', tabs)).toBe(
      'file:edit:README.md',
    )
  })

  it('maps legacy file tab ids to edit tabs', () => {
    const tabs = normalizeWorkspaceTabs([{ kind: 'file', path: 'README.md' }])

    expect(normalizeWorkspaceTabId('file:README.md', tabs)).toBe('file:edit:README.md')
  })

  it('falls back when the active id references a removed graph file view', () => {
    const tabs = normalizeRuntimeWorkspaceTabs([
      { kind: 'file', path: 'README.md', view: 'edit' },
      { kind: 'file', path: 'legacy.md', view: 'graph' },
    ])

    expect(normalizeWorkspaceTabId('file:graph:legacy.md', tabs)).toBe('file:edit:README.md')
  })
})

describe('web tabs', () => {
  it('normalizes and deduplicates runtime web tabs by their opaque id', () => {
    const tabs = normalizeRuntimeWorkspaceTabs([
      { kind: 'web', id: 'docs', url: 'https://example.com/docs', title: 'Docs' },
      { kind: 'web', id: 'docs', url: 'https://example.com/private', title: 'Private' },
      { kind: 'web', id: '', url: 'https://example.com', title: 'Invalid' },
      { kind: 'web', id: 'unsafe', url: 'file:///etc/passwd', title: 'Invalid' },
      { kind: 'web', id: 'http', url: 'http://example.com', title: 'Invalid' },
      { kind: 'web', id: 'secret', url: 'https://user:secret@example.com', title: 'Invalid' },
    ])

    expect(tabs).toEqual([
      { kind: 'web', id: 'docs', url: 'https://example.com/docs', title: 'Docs' },
    ])
    expect(getWorkspaceTabId(tabs[0])).toBe('web:docs')
  })

  it('creates an in-memory web tab without using the URL as its identity', () => {
    expect(createWebTab(' https://example.com/docs ', 'Docs', 'opaque-id')).toEqual({
      kind: 'web',
      id: 'opaque-id',
      url: 'https://example.com/docs',
      title: 'Docs',
    })
  })

  it('omits web tabs and their sensitive URLs from persisted workspace state', () => {
    const tabs = normalizeRuntimeWorkspaceTabs([
      { kind: 'file', path: 'README.md' },
      { kind: 'web', id: 'docs', url: 'https://example.com/private?token=secret', title: 'Docs' },
    ])

    expect(getPersistableWorkspaceTabs(tabs)).toEqual([
      { kind: 'file', path: 'README.md', view: 'edit' },
    ])
  })

  it('drops web tabs from restored persisted data', () => {
    expect(
      normalizeWorkspaceTabs([
        { kind: 'web', id: 'docs', url: 'https://example.com/private', title: 'Docs' },
      ]),
    ).toEqual([])
  })

  it('detects native title and URL updates for the same web tab', () => {
    const current = [createWebTab('https://example.com/one', 'One', 'web-id')]
    const updated = [createWebTab('https://example.com/two', 'Two', 'web-id')]

    expect(areWorkspaceTabsEqual(current, updated)).toBe(false)
  })
})
