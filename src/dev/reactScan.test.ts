import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeReactScan, shouldEnableReactScan } from '@/dev/reactScan'

const scan = vi.hoisted(() => vi.fn())

vi.mock('react-scan', () => ({ scan }))

describe('React Scan development defaults', () => {
  beforeEach(() => {
    scan.mockReset()
  })

  it('enables scanning by default only in development', () => {
    expect(shouldEnableReactScan(true, undefined)).toBe(true)
    expect(shouldEnableReactScan(true, 'true')).toBe(true)
    expect(shouldEnableReactScan(true, 'false')).toBe(false)
    expect(shouldEnableReactScan(false, 'true')).toBe(false)
  })

  it('loads React Scan when development diagnostics are enabled', async () => {
    initializeReactScan(true)

    await vi.waitFor(() => expect(scan).toHaveBeenCalledWith({ enabled: true }))
  })

  it('does not load React Scan when the development flag disables it', async () => {
    initializeReactScan(true, 'false')
    await Promise.resolve()

    expect(scan).not.toHaveBeenCalled()
  })
})
