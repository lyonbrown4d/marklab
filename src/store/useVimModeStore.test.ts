import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVimModeStore, vimTabKey } from '@/store/useVimModeStore'

beforeEach(() => useVimModeStore.setState({ perTabOverrides: {} }))

describe('per-tab Vim overrides', () => {
  it('keeps source and edit tabs and workspaces independent', () => {
    const { setTabOverride } = useVimModeStore.getState()
    setTabOverride('external:/one', 'file:source:note.md', true)
    setTabOverride('external:/one', 'file:edit:note.md', false)
    setTabOverride('external:/two', 'file:source:note.md', false)
    expect(useVimModeStore.getState().perTabOverrides).toEqual({
      [vimTabKey('external:/one', 'file:source:note.md')]: true,
      [vimTabKey('external:/one', 'file:edit:note.md')]: false,
      [vimTabKey('external:/two', 'file:source:note.md')]: false,
    })
    setTabOverride('external:/one', 'file:source:note.md', undefined)
    expect(useVimModeStore.getState().perTabOverrides).not.toHaveProperty(
      vimTabKey('external:/one', 'file:source:note.md'),
    )
  })

  it('prunes closed tabs and departed workspaces without affecting open tab overrides', () => {
    const { setTabOverride, pruneTabOverrides } = useVimModeStore.getState()
    setTabOverride('one', 'open', true)
    setTabOverride('one', 'closed', false)
    setTabOverride('other', 'open', true)
    pruneTabOverrides('one', ['open'])
    expect(useVimModeStore.getState().perTabOverrides).toEqual({
      [vimTabKey('one', 'open')]: true,
    })
    pruneTabOverrides('one', [])
    expect(useVimModeStore.getState().perTabOverrides).toEqual({})
  })

  it('does not notify subscribers for unchanged overrides or pruning', () => {
    const { setTabOverride, pruneTabOverrides } = useVimModeStore.getState()
    setTabOverride('one', 'open', false)
    const listener = vi.fn()
    const unsubscribe = useVimModeStore.subscribe(listener)
    setTabOverride('one', 'open', false)
    setTabOverride('one', 'unknown', undefined)
    pruneTabOverrides('one', ['open'])
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })
})
