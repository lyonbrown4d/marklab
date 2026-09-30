import { describe, expect, it } from 'vitest'
import { pathToWorkspaceHistoryRoute, WORKSPACE_HISTORY_ROUTE_PATTERN } from '@/logic/routing'

describe('workspace history routing', () => {
  it('uses a stable workspace-level route', () => {
    expect(WORKSPACE_HISTORY_ROUTE_PATTERN).toBe('/workspace/history')
    expect(pathToWorkspaceHistoryRoute()).toBe('/workspace/history')
  })
})
