import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandDialogFooter from '@/components/command/CommandDialogFooter'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/runtime/environment', () => ({
  inferPlatformFromUserAgent: () => 'macos',
}))

describe('CommandDialogFooter', () => {
  it('shows the Command modifier on macOS', () => {
    render(<CommandDialogFooter />)

    expect(screen.getByText('⌘ 1–3')).toBeInTheDocument()
    expect(screen.queryByText('Ctrl 1–3')).not.toBeInTheDocument()
  })
})
