import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useNativeSurfaceOccluded,
  useNativeSurfaceOcclusion,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'

beforeEach(() => useNativeSurfaceOcclusionStore.setState({ reasons: {} }))

describe('native surface occlusion', () => {
  it('keeps a reason active until every owner releases it', () => {
    const first = renderHook(() => useNativeSurfaceOcclusion('dialog', true))
    const second = renderHook(() => useNativeSurfaceOcclusion('dialog', true))
    const status = renderHook(() => useNativeSurfaceOccluded())

    expect(status.result.current).toBe(true)
    first.unmount()
    expect(status.result.current).toBe(true)
    second.unmount()
    expect(status.result.current).toBe(false)
  })

  it('does not occupy the native surface for an inactive overlay', () => {
    renderHook(() => useNativeSurfaceOcclusion('settings', false))
    const status = renderHook(() => useNativeSurfaceOccluded())

    expect(status.result.current).toBe(false)
  })
})
