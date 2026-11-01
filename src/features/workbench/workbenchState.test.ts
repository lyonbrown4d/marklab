import { describe, expect, it } from 'vitest'
import { documentAtRoute } from '@/features/workbench/workbenchState'

describe('workspace document routes', () => {
  it.each([
    ['/files/edit/folder/100%.md', 'folder/100%.md', 'edit'],
    ['/files/source/100%25.md', '100%.md', 'source'],
    ['/files/preview/%E6%96%87%E6%A1%A3.pdf', '文档.pdf', 'preview'],
  ])('binds %s to the editor document path', (route, path, view) => {
    expect(documentAtRoute(route)).toEqual({ path, view })
  })

  it('does not bind non-document panes to a buffer', () => {
    expect(documentAtRoute('/workspace/graph')).toBeNull()
    expect(documentAtRoute('/workspace/pages?collection=all')).toBeNull()
  })
})
