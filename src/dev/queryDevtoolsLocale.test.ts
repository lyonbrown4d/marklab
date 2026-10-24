import { describe, expect, it } from 'vitest'
import { isQueryDevtoolsLocaleSupported } from '@/dev/queryDevtoolsLocale'

describe('Query Devtools locale compatibility', () => {
  it.each(['en-US', 'zh-CN', 'ar', ''])('checks the Intl locale %j', (locale) => {
    expect(isQueryDevtoolsLocaleSupported(locale)).toBe(locale !== '')
  })

  it.each(['C', 'C.UTF-8', 'en_US.UTF-8', 'en_US'])('rejects POSIX locale %j', (locale) => {
    expect(isQueryDevtoolsLocaleSupported(locale)).toBe(false)
  })
})
