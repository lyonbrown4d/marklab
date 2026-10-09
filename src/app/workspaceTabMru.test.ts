import { describe, expect, it } from 'vitest'
import { nextTabInMru, updateTabMru } from '@/app/workspaceTabMru'

describe('workspace tab MRU', () => {
  it('selects the most recently used inactive tab without changing visual order', () => {
    const visibleOrder = ['one', 'two', 'three']
    let mru = updateTabMru([], visibleOrder, 'one')
    mru = updateTabMru(mru, visibleOrder, 'three')
    mru = updateTabMru(mru, visibleOrder, 'two')

    expect(mru).toEqual(['two', 'three', 'one'])
    expect(nextTabInMru(mru, 'two', 1)).toBe('three')
    expect(visibleOrder).toEqual(['one', 'two', 'three'])
  })

  it('removes closed tabs, appends newly opened tabs, and handles an unknown active tab', () => {
    expect(updateTabMru(['closed', 'one'], ['one', 'new'], null)).toEqual(['one', 'new'])
    expect(nextTabInMru(['one', 'new'], 'missing', 1)).toBe('one')
    expect(nextTabInMru([], null, -1)).toBeNull()
  })

  it('can move in reverse MRU order', () => {
    expect(nextTabInMru(['active', 'recent', 'oldest'], 'active', -1)).toBe('oldest')
  })
})
