import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSlashCommandLabels } from '@/components/milkdown/useSlashCommandLabels'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => `translated:${key}` }),
}))

describe('useSlashCommandLabels', () => {
  it('maps the shared slash command labels through i18n', () => {
    const { result } = renderHook(useSlashCommandLabels)

    expect(result.current.textGroup).toBe('translated:slash.textGroup')
    expect(result.current.calendarFilePrompt).toBe('translated:slash.calendarFilePrompt')
  })
})
