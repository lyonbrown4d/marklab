import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

const miniMapProps = vi.hoisted(() => ({
  current: null as (ComponentProps<'div'> & Record<string, unknown>) | null,
}))
const preferences = vi.hoisted(() => ({
  graphMiniMapPosition: 'top-left' as const,
  graphMiniMapSize: 'compact' as const,
}))
const flowState = vi.hoisted(() => ({ width: 1_000 }))

vi.mock('@xyflow/react', () => ({
  MiniMap: (props: ComponentProps<'div'> & Record<string, unknown>) => {
    miniMapProps.current = props
    return <div data-testid="minimap" />
  },
  useStore: (selector: (state: typeof flowState) => unknown) => selector(flowState),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (selector: (state: typeof preferences) => unknown) => selector(preferences),
}))

import {
  GraphMiniMap,
  knowledgeGraphMiniMapFallbacks,
  knowledgeGraphMiniMapOffsets,
} from '@/pages/graph/GraphMiniMapView'

describe('GraphMiniMap', () => {
  beforeEach(() => {
    miniMapProps.current = null
    flowState.width = 1_000
  })

  it('moves top chrome positions to a clear corner on narrow canvases', () => {
    flowState.width = 640
    render(
      <GraphMiniMap
        narrowFallbacks={knowledgeGraphMiniMapFallbacks}
        nodeCount={12}
        offsets={knowledgeGraphMiniMapOffsets}
        show
      />,
    )

    expect(miniMapProps.current).toMatchObject({ position: 'bottom-right' })
  })

  it('uses persisted navigation behavior, size, position, and page-specific clearance', () => {
    render(<GraphMiniMap nodeCount={12} offsets={knowledgeGraphMiniMapOffsets} show />)

    expect(miniMapProps.current).toMatchObject({
      ariaLabel: 'graph.minimapLabel',
      pannable: true,
      position: 'top-left',
      style: { height: 90, marginTop: 104, width: 128 },
      zoomable: true,
    })
  })

  it('does not mount for a graph too small to benefit from navigation', () => {
    render(<GraphMiniMap nodeCount={3} show />)

    expect(miniMapProps.current).toBeNull()
  })
})
