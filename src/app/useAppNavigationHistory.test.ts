import { describe, expect, it } from 'vitest'
import { getCurrentNavigationLocation } from '@/app/useAppNavigationHistory'

describe('getCurrentNavigationLocation', () => {
  it('records the workspace map and its active node as navigation history', () => {
    expect(
      getCurrentNavigationLocation({
        activePath: 'notes/Home.md',
        viewMode: 'wysiwyg',
        workspaceView: 'map',
      }),
    ).toEqual({ kind: 'graph', nodeId: 'notes/Home.md' })
    expect(
      getCurrentNavigationLocation({
        activePath: null,
        viewMode: 'wysiwyg',
        workspaceView: 'map',
      }),
    ).toEqual({ kind: 'graph', nodeId: 'workspace' })
  })

  it('keeps file view locations outside the workspace map', () => {
    expect(
      getCurrentNavigationLocation({
        activePath: 'notes/Home.md',
        viewMode: 'source',
        workspaceView: 'files',
      }),
    ).toEqual({ kind: 'file', path: 'notes/Home.md', view: 'source' })
  })
})
