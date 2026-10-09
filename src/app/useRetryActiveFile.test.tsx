import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRetryActiveFile } from '@/app/useRetryActiveFile'

const router = vi.hoisted(() => ({
  location: {
    hash: '#heading',
    pathname: '/file/README.md',
    search: '?view=edit',
    state: { editorLoadGeneration: 3 },
  },
  navigate: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useLocation: () => router.location,
  useNavigate: () => router.navigate,
}))

describe('useRetryActiveFile', () => {
  it('retries the current route with a new editor load generation', () => {
    const { result } = renderHook(() => useRetryActiveFile())

    result.current()

    expect(router.navigate).toHaveBeenCalledWith(
      {
        hash: '#heading',
        pathname: '/file/README.md',
        search: '?view=edit',
      },
      {
        replace: true,
        state: { editorLoadGeneration: 4 },
      },
    )
  })
})
