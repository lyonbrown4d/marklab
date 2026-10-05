import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WebDavProfileDialog } from '@/components/settings/WebDavProfileDialog'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('WebDavProfileDialog', () => {
  it('keeps an existing password when the password field stays empty', async () => {
    const onSubmit = vi.fn()
    render(
      <WebDavProfileDialog
        open
        pending={false}
        profile={{
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
        }}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      id: 'cloud',
      label: 'Home cloud',
      endpoint: 'https://dav.example.com',
      basePath: '/',
      username: 'ada',
      password: undefined,
      allowInsecureLocal: false,
      sessionOnly: false,
    })
  })

  it('requires a password for a new connection', async () => {
    render(
      <WebDavProfileDialog
        open
        pending={false}
        profile={null}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText('sync.settings.name'), 'Home cloud')
    await userEvent.type(screen.getByLabelText('sync.settings.endpoint'), 'https://dav.example.com')
    await userEvent.type(screen.getByLabelText('sync.settings.username'), 'ada')
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled()
  })

  it('requires explicit consent before submitting an insecure HTTP endpoint', async () => {
    render(
      <WebDavProfileDialog
        open
        pending={false}
        profile={null}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    await userEvent.type(screen.getByLabelText('sync.settings.name'), 'Local cloud')
    await userEvent.type(screen.getByLabelText('sync.settings.endpoint'), 'http://127.0.0.1:8080')
    await userEvent.type(screen.getByLabelText('sync.settings.username'), 'ada')
    await userEvent.type(screen.getByLabelText('sync.settings.password'), 'secret')
    const save = screen.getByRole('button', { name: 'common.save' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByRole('switch', { name: 'sync.settings.allowInsecureLocal' }))
    expect(save).toBeEnabled()
  })
})
