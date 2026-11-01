import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOpenGraphWebsite } from '@/features/knowledge-graph/useOpenGraphWebsite'
import { testExternalGraphNode } from '@/features/knowledge-graph/testGraph'

const { openWebTab } = vi.hoisted(() => ({ openWebTab: vi.fn() }))
vi.mock('@/app/useOpenWebTab', () => ({ useOpenWebTab: () => openWebTab }))

beforeEach(() => vi.restoreAllMocks())

describe('graph website opening', () => {
  it('opens HTTPS in an existing web tab and HTTP through the native external-link flow only on activation', () => {
    openWebTab.mockClear()
    const external = vi.spyOn(window, 'open').mockReturnValue(null)
    const node = testExternalGraphNode()
    const { result } = renderHook(() => useOpenGraphWebsite())
    expect(openWebTab).not.toHaveBeenCalled()
    expect(external).not.toHaveBeenCalled()
    act(() => result.current(node))
    expect(openWebTab).toHaveBeenCalledExactlyOnceWith(node.url, node.label)
    expect(external).not.toHaveBeenCalled()
    act(() => result.current({ ...node, url: 'http://example.com/guide' }))
    expect(external).toHaveBeenCalledExactlyOnceWith(
      'http://example.com/guide',
      '_blank',
      'noopener,noreferrer',
    )
    expect(openWebTab).toHaveBeenCalledTimes(1)
  })

  it('rejects privileged protocols, credentials and malformed URLs without any navigation', () => {
    openWebTab.mockClear()
    const external = vi.spyOn(window, 'open').mockReturnValue(null)
    const { result } = renderHook(() => useOpenGraphWebsite())
    for (const url of [
      'javascript:alert(1)',
      'file:///secret',
      'https://user@example.com',
      'invalid',
    ])
      act(() => result.current({ ...testExternalGraphNode(), url }))
    expect(openWebTab).not.toHaveBeenCalled()
    expect(external).not.toHaveBeenCalled()
  })
})
