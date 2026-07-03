import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import AppCommandDialog from '@/components/AppCommandDialog'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'command.palette' ? 'Command palette' : key),
  }),
}))

describe('AppCommandDialog', () => {
  it('labels the command dialog from i18n', () => {
    render(
      <AppCommandDialog open onOpenChange={vi.fn()}>
        <div>Command content</div>
      </AppCommandDialog>,
    )

    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })
})
