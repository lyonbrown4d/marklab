import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { editorBufferIdentity, useEditorBufferState } from '@/app/useEditorBufferState'

const candidate = { workspace: 'workspace', path: 'a.md', content: 'saved', lastActive: 0 }
const identity = editorBufferIdentity('workspace', 'a.md')
const mount = () => {
  const hook = renderHook(() => useEditorBufferState('workspace'))
  act(() => {
    hook.result.current.setWorkspaceFileContents({ workspace: { 'a.md': 'saved' } })
    hook.result.current.setPathSaveState('workspace', 'a.md', { status: 'saved' })
    hook.result.current.setLoadedVersions({ [identity]: 1 })
  })
  return hook
}

describe('atomic saved buffer eviction', () => {
  it('removes text and metadata together only after confirming it is still clean', () => {
    const { result } = mount()
    act(() => result.current.evictSavedBuffers([candidate], () => false))
    expect(result.current.fileContents).toEqual({})
    expect(result.current.saveStates).toEqual({})
    expect(result.current.loadedVersions).toEqual({})
  })

  it.each(['content', 'dirty', 'loading', 'saving', 'pending'] as const)(
    'keeps all metadata when %s changes after eviction selection',
    (change) => {
      const { result } = mount()
      act(() => {
        if (change === 'content')
          result.current.setWorkspaceFileContents({ workspace: { 'a.md': 'new edit' } })
        if (change === 'dirty')
          result.current.setWorkspaceDirtyPaths({ workspace: { 'a.md': true } })
        if (change === 'loading') result.current.setPathLoading('workspace', 'a.md', true)
        if (change === 'saving')
          result.current.setPathSaveState('workspace', 'a.md', { status: 'saving' })
        result.current.evictSavedBuffers([candidate], () => change === 'pending')
      })
      expect(result.current.fileContents['a.md']).toBe(change === 'content' ? 'new edit' : 'saved')
      expect(result.current.saveStates['a.md']?.status).toBe(
        change === 'saving' ? 'saving' : 'saved',
      )
      expect(result.current.loadedVersions[identity]).toBe(1)
    },
  )
})
