import { beforeEach, describe, expect, it } from 'vitest'
import {
  requestWorkspaceMapNodeFocus,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

describe('workspace map navigation requests', () => {
  beforeEach(() => workspaceMapNavigationStore.setState({ request: null }))

  it('retains a typed request until the workspace map can consume it', () => {
    const request = {
      nodeId: 'notes/Home.md',
      viewport: { x: 12, y: 24, zoom: 0.8 },
      workspaceKey: 'workspace:a',
    }

    requestWorkspaceMapNodeFocus(request)

    expect(workspaceMapNavigationStore.getState().request).toBe(request)
  })
})
