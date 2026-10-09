import { describe, expect, it } from 'vitest'
import { getWorkspaceMapViewportLod } from '@/pages/workspace-map/workspaceMapViewportLod'

describe('getWorkspaceMapViewportLod', () => {
  it.each([
    [0.35, 'far'],
    [0.54, 'far'],
    [0.55, 'mid'],
    [0.89, 'mid'],
    [0.9, 'near'],
    [2.2, 'near'],
  ] as const)('maps zoom %s to %s detail', (zoom, expected) => {
    expect(getWorkspaceMapViewportLod(zoom)).toBe(expected)
  })
})
