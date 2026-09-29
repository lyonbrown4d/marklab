import { describe, expect, it } from 'vitest'
import { shouldEnableReactScan } from '@/dev/reactScan'

describe('React Scan development defaults', () => {
  it('enables scanning by default only in development', () => {
    expect(shouldEnableReactScan(true, undefined)).toBe(true)
    expect(shouldEnableReactScan(true, 'true')).toBe(true)
    expect(shouldEnableReactScan(true, 'false')).toBe(false)
    expect(shouldEnableReactScan(false, 'true')).toBe(false)
  })
})
