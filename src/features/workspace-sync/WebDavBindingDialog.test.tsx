import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WebDavBindingDialog } from '@/features/workspace-sync/WebDavBindingDialog'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('WebDavBindingDialog', () => {
  it('announces a binding mutation failure inside the active dialog', () => {
    render(
      <WebDavBindingDialog
        open
        profiles={[
          {
            id: 'cloud',
            label: 'Home cloud',
            endpoint: 'https://dav.example.com',
            basePath: '/',
            username: 'ada',
            allowInsecureLocal: false,
            sessionOnly: false,
            hasPassword: true,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ]}
        pending={false}
        error="sync.menu.updateFailed"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toHaveTextContent('sync.menu.updateFailed')
  })
})
