import { beforeEach, describe, expect, it } from 'vitest'
import {
  navigationHistoryStore,
  type NavigationLocation,
} from '@/features/navigation/navigationHistory'

const file = (path: string): NavigationLocation => ({ kind: 'file', path, view: 'edit' })

describe('navigationHistoryStore', () => {
  beforeEach(() => navigationHistoryStore.getState().reset('external:/workspace'))

  it('moves backward and forward through visited locations without duplicating history', () => {
    const history = navigationHistoryStore.getState()
    history.visit(file('one.md'))
    history.visit({ kind: 'heading', path: 'two.md', slug: 'details' })
    history.visit({ kind: 'source', path: 'three.md', line: 8, column: 4 })

    expect(navigationHistoryStore.getState().back()).toEqual({
      kind: 'heading',
      path: 'two.md',
      slug: 'details',
    })
    expect(navigationHistoryStore.getState().back()).toEqual(file('one.md'))
    expect(navigationHistoryStore.getState().back()).toBeNull()
    expect(navigationHistoryStore.getState().forward()).toEqual({
      kind: 'heading',
      path: 'two.md',
      slug: 'details',
    })
  })

  it('drops the forward branch after a new visit and isolates workspaces', () => {
    const history = navigationHistoryStore.getState()
    history.visit(file('one.md'))
    history.visit(file('two.md'))
    history.back()
    history.visit(file('branch.md'))

    expect(navigationHistoryStore.getState().forward()).toBeNull()
    expect(navigationHistoryStore.getState().recent()).toEqual([file('branch.md'), file('one.md')])

    navigationHistoryStore.getState().reset('external:/other')
    expect(navigationHistoryStore.getState().recent()).toEqual([])
  })

  it('deduplicates consecutive positions and exposes graph locations for later integration', () => {
    const graphLocation: NavigationLocation = {
      kind: 'graph',
      nodeId: 'docs/guide.md',
      viewport: { x: 12, y: 24, zoom: 1.5 },
    }
    const history = navigationHistoryStore.getState()
    history.visit(graphLocation)
    history.visit(graphLocation)

    expect(navigationHistoryStore.getState().recent()).toEqual([graphLocation])
  })

  it('updates the current graph location with its measured viewport without adding history noise', () => {
    const history = navigationHistoryStore.getState()
    const viewport = { x: 12, y: 24, zoom: 1.5 }
    history.visit({ kind: 'graph', nodeId: 'docs/guide.md' })
    history.visit({ kind: 'graph', nodeId: 'docs/guide.md', viewport })
    history.visit({ kind: 'graph', nodeId: 'docs/guide.md' })

    expect(navigationHistoryStore.getState().entries).toEqual([
      { kind: 'graph', nodeId: 'docs/guide.md', viewport },
    ])
  })

  it('keeps an explicit edit position when the matching route reports its generic file view', () => {
    const history = navigationHistoryStore.getState()
    const source = { kind: 'source' as const, path: 'guide.md', line: 12, column: 3 }
    history.visit(source)
    history.visit({ kind: 'file', path: 'guide.md', view: 'source' })

    expect(navigationHistoryStore.getState().recent()).toEqual([source])
  })
})
