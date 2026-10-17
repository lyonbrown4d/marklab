import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n/setup'
import { GitCredentialForm } from '@/features/git/worktree/GitCredentialForm'

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
  expect(screen.queryByText('HTTPS authentication')).not.toBeInTheDocument()
})
