import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMindmapHistory } from '@/pages/graph/useMindmapHistory'

describe('useMindmapHistory', () => {
  it('undoes and redoes local structural and title commits in order', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ markdown }) => useMindmapHistory(markdown, onChange, true),
      { initialProps: { markdown: '# Root' } },
    )

    act(() => result.current.commit('# Root\n## Child'))
    rerender({ markdown: '# Root\n## Child' })
    act(() => result.current.commit('# Renamed\n## Child'))
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(onChange).toHaveBeenLastCalledWith('# Root\n## Child')
    act(() => result.current.redo())
    expect(onChange).toHaveBeenLastCalledWith('# Renamed\n## Child')
  })

  it('resets stale history for an unrelated external document change', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ markdown }) => useMindmapHistory(markdown, onChange, true),
      { initialProps: { markdown: '# Root' } },
    )
    act(() => result.current.commit('# Root\n## Child'))
    rerender({ markdown: '# External' })
    expect(result.current.canUndo).toBe(false)
  })
})
