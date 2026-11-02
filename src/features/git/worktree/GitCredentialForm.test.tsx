import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n/setup'
import { GitCredentialForm } from '@/features/git/worktree/GitCredentialForm'
import { GitRemoteDialog } from '@/features/git/worktree/GitRemoteDialog'

const api = vi.hoisted(() => ({ available: vi.fn(() => true), save: vi.fn(), remove: vi.fn() }))
vi.mock('@/services/gitCredentialsApi', () => ({ gitCredentialsApi: api }))

beforeEach(async () => {
  await i18n.changeLanguage('en-US')
  api.save.mockReset()
  api.remove.mockReset()
})
const show = (url = 'https://github.com/team/repo.git') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GitCredentialForm url={url} />
    </QueryClientProvider>,
  )

it('submits once, clears the token after saving, and removes credentials explicitly', async () => {
  let finish!: (value: { ok: boolean }) => void
  api.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  api.remove.mockResolvedValue({ ok: true })
  show()
  fireEvent.click(screen.getByText('HTTPS authentication'))
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'writer' } })
  const token = screen.getByLabelText('Access token')
  fireEvent.change(token, { target: { value: 'test-token' } })
  const form = token.closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  await act(async () => {
    await Promise.resolve()
  })
  expect(api.save).toHaveBeenCalledTimes(1)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save credentials' })).toBeDisabled(),
  )
  await act(async () => {
    finish({ ok: true })
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Updated')
  expect(token).toHaveValue('')
  expect(api.save.mock.calls[0]?.[0].token).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Remove credentials' }))
  await act(async () => {
    await Promise.resolve()
  })
  expect(api.remove).toHaveBeenCalledWith('https://github.com/team/repo.git')
  fireEvent.change(screen.getByLabelText('HTTPS server URL'), {
    target: { value: 'https://other.example' },
  })
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
})

it('initializes credentials when remotes finish loading and clears secrets when the remote changes', () => {
  const client = new QueryClient()
  const dialog = (host?: string) => (
    <QueryClientProvider client={client}>
      <GitRemoteDialog
        open
        onOpenChange={vi.fn()}
        busy={false}
        error={null}
        onSave={vi.fn()}
        onRemove={vi.fn()}
        status={
          host
            ? {
                remotes: [
                  { name: 'origin', fetch_url: `git@${host}:team/repo.git`, push_url: null },
                ],
                branch: 'main',
                upstream: null,
                ahead: 0,
                behind: 0,
                detached: false,
              }
            : undefined
        }
      />
    </QueryClientProvider>
  )
  const view = render(dialog())
  view.rerender(dialog('git.example'))
  fireEvent.click(screen.getByText('HTTPS authentication'))
  expect(screen.getByLabelText('HTTPS server URL')).toHaveValue('https://git.example')
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'test-token' } })
  view.rerender(dialog('other.example'))
  fireEvent.click(screen.getByText('HTTPS authentication'))
  expect(screen.getByLabelText('HTTPS server URL')).toHaveValue('https://other.example')
  expect(screen.getByLabelText('Access token')).toHaveValue('')
})

it('keeps user input when the credential store fails and handles incomplete remote URLs', async () => {
  api.save.mockRejectedValue(new Error('Credential store unavailable'))
  const view = show()
  fireEvent.click(screen.getByText('HTTPS authentication'))
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'writer' } })
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'test-token' } })
  fireEvent.submit(screen.getByLabelText('Access token').closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Credential store unavailable')
  expect(screen.getByLabelText('Access token')).toHaveValue('test-token')
  view.unmount()
  show('https://')
  fireEvent.click(screen.getByText('HTTPS authentication'))
  expect(screen.getByLabelText('HTTPS server URL')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Remove credentials' })).toBeDisabled()
})

it.each(['git@git.example.com:team/repo.git', 'ssh://git@git.example.com:2222/team/repo.git'])(
  'saves HTTPS credentials for an SSH remote without changing its address: %s',
  async (remoteUrl) => {
    api.save.mockResolvedValue({ ok: true })
    const remote = { url: remoteUrl }
    show(remote.url)
    fireEvent.click(screen.getByText('HTTPS authentication'))
    expect(screen.getByLabelText('HTTPS server URL')).toHaveValue('https://git.example.com')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'writer' } })
    fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'ssh-lfs-token' } })
    fireEvent.submit(screen.getByLabelText('Access token').closest('form')!)
    await screen.findByRole('status')
    expect(api.save).toHaveBeenCalledWith({
      url: 'https://git.example.com',
      username: 'writer',
      token: '',
    })
    expect(remote.url).toBe(remoteUrl)
  },
)

it('uses the independently edited HTTPS server for saving and removing credentials', async () => {
  api.save.mockResolvedValue({ ok: true })
  api.remove.mockResolvedValue({ ok: true })
  show('git@git.example.com:team/repo.git')
  fireEvent.click(screen.getByText('HTTPS authentication'))
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'old-host-token' } })
  fireEvent.change(screen.getByLabelText('HTTPS server URL'), {
    target: { value: 'https://lfs.example.com:8443/storage' },
  })
  expect(screen.getByLabelText('Access token')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'writer' } })
  fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'lfs-token' } })
  fireEvent.submit(screen.getByLabelText('Access token').closest('form')!)
  await screen.findByRole('status')
  expect(api.save).toHaveBeenCalledWith({
    url: 'https://lfs.example.com:8443/storage',
    username: 'writer',
    token: '',
  })
  fireEvent.click(screen.getByRole('button', { name: 'Remove credentials' }))
  await waitFor(() =>
    expect(api.remove).toHaveBeenCalledWith('https://lfs.example.com:8443/storage'),
  )
})

it.each([
  'http://lfs.example.com',
  'https://user:secret@lfs.example.com',
  'https://user@lfs.example.com',
  'https://',
  'invalid',
])('blocks both credential actions for an invalid or insecure server: %s', (serverUrl) => {
  show()
  fireEvent.click(screen.getByText('HTTPS authentication'))
  fireEvent.change(screen.getByLabelText('HTTPS server URL'), { target: { value: serverUrl } })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'writer' } })
  const token = screen.getByLabelText('Access token')
  fireEvent.change(token, { target: { value: 'must-not-submit' } })
  expect(screen.getByRole('button', { name: 'Save credentials' })).toBeDisabled()
  const remove = screen.getByRole('button', { name: 'Remove credentials' })
  expect(remove).toBeDisabled()
  fireEvent.submit(token.closest('form')!)
  fireEvent.click(remove)
  expect(api.save).not.toHaveBeenCalled()
  expect(api.remove).not.toHaveBeenCalled()
})
