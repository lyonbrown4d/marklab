import { describe, expect, it } from 'vitest'
import { pathToWebTabRoute, pathToWorkspaceTabRoute, WEB_TAB_ROUTE_PATTERN } from '@/logic/routing'

describe('web tab routing', () => {
  it('uses only the opaque tab id in the route', () => {
    expect(WEB_TAB_ROUTE_PATTERN).toBe('/web/:tabId')
    expect(pathToWebTabRoute('tab with spaces')).toBe('/web/tab%20with%20spaces')
  })

  it('resolves workspace tabs without exposing a web URL', () => {
    expect(
      pathToWorkspaceTabRoute({
        kind: 'web',
        id: 'opaque-id',
        title: 'Private',
        url: 'https://example.com/?token=secret',
      }),
    ).toBe('/web/opaque-id')
  })
})
