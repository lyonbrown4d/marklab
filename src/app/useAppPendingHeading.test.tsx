import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAppPendingHeading } from '@/app/useAppPendingHeading'
import { onFocusHeadingRequest, type FocusHeadingRequest } from '@/utils/editorNavigation'

describe('useAppPendingHeading', () => {
  it('queues a workspace-scoped heading request before opening the target editor', () => {
    const requests: FocusHeadingRequest[] = []
    const unsubscribe = onFocusHeadingRequest((request) => requests.push(request))
    const onOpenFileView = vi.fn()
    const { result } = renderHook(() =>
      useAppPendingHeading({
        activePath: 'notes/current.md',
        onOpenFileView,
        viewMode: 'wysiwyg',
        workspaceKey: 'external:C:/notes',
      }),
    )

    try {
      act(() => result.current('notes/target.md', 'details'))

      expect(requests).toEqual([
        {
          path: 'notes/target.md',
          slug: 'details',
          workspaceKey: 'external:C:/notes',
        },
      ])
      expect(onOpenFileView).toHaveBeenCalledWith('notes/target.md', 'edit')
    } finally {
      unsubscribe()
    }
  })
})
