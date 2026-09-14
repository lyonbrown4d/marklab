import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlashUrlDialog } from '@/components/milkdown/SlashUrlDialog'
import { useSlashUrlDialog } from '@/components/milkdown/useSlashUrlDialog'
import type { SlashUrlInsertionRequest } from '@/components/milkdown/slashUrlInsertion'
import { slashMenuTestLabels as labels } from '@/components/milkdown/slashMenuConfigTestFixtures'

const createRequest = (
  kind: SlashUrlInsertionRequest['kind'] = 'link',
): SlashUrlInsertionRequest => ({
  kind,
  initialText: 'Selected text',
  insert: vi.fn(),
  invalidate: vi.fn(),
  restoreFocus: vi.fn(),
})

const Harness = ({
  request,
  path = 'a.md',
}: {
  request: SlashUrlInsertionRequest
  path?: string
}) => {
  const state = useSlashUrlDialog(path)
  return (
    <>
      <button onClick={() => state.open(request)}>Open</button>
      {state.request && (
        <SlashUrlDialog
          state={state}
          labels={labels}
          cancelLabel="Cancel"
          errorLabel="Insertion failed"
        />
      )}
    </>
  )
}

describe('slash URL dialog', () => {
  it.each(['link', 'image-url'] as const)(
    'focuses the URL and submits %s via Enter',
    async (kind) => {
      const request = createRequest(kind)
      const user = userEvent.setup()
      render(<Harness request={request} />)
      await user.click(screen.getByText('Open'))
      const input = screen.getByLabelText(
        kind === 'link' ? labels.linkUrlPrompt : labels.imageUrlPrompt,
      )
      expect(input).toHaveFocus()
      expect(
        screen.getByLabelText(kind === 'link' ? labels.linkTextPrompt : labels.imageAltPrompt),
      ).toHaveValue('Selected text')
      await user.type(input, 'https://example.com/path{Enter}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(request.insert).toHaveBeenCalledExactlyOnceWith({
        url: 'https://example.com/path',
        text: 'Selected text',
      })
      expect(request.restoreFocus).toHaveBeenCalledOnce()
    },
  )

  it.each(['Escape', 'Cancel', 'Close'])(
    'cancels via %s without insertion and restores focus',
    async (method) => {
      const request = createRequest()
      const user = userEvent.setup()
      render(<Harness request={request} />)
      await user.click(screen.getByText('Open'))
      if (method === 'Escape') await user.keyboard('{Escape}')
      else await user.click(screen.getByRole('button', { name: method }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(request.insert).not.toHaveBeenCalled()
      expect(request.restoreFocus).toHaveBeenCalledOnce()
    },
  )

  it('rejects whitespace, displays insertion errors, and allows retry', async () => {
    const request = createRequest()
    vi.mocked(request.insert).mockImplementationOnce(() => {
      throw new Error('failed')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    const input = screen.getByLabelText(labels.linkUrlPrompt)
    await user.type(input, '   {Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(labels.linkUrlPrompt)
    expect(request.insert).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, './note.md{Enter}')
    expect(await screen.findByText('Insertion failed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Link' }))
    expect(request.insert).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on document switch and rejects an already queued form submission', async () => {
    const request = createRequest()
    const { rerender } = render(<Harness request={request} />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent.change(screen.getByLabelText(labels.linkUrlPrompt), { target: { value: '/url' } })
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
    rerender(<Harness request={request} path="b.md" />)
    await act(async () => {})
    expect(request.invalidate).toHaveBeenCalledOnce()
    expect(request.insert).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('rejects stale callbacks after A/B/A switches, replacement, cancel, and unmount', () => {
    const { result, rerender, unmount } = renderHook(({ path }) => useSlashUrlDialog(path), {
      initialProps: { path: 'a.md' },
    })
    const old = createRequest()
    act(() => result.current.open(old))
    const submit = result.current.submit
    rerender({ path: 'b.md' })
    rerender({ path: 'a.md' })
    act(() => submit(old, { url: '/old', text: '' }))
    expect(old.insert).not.toHaveBeenCalled()
    const next = createRequest()
    act(() => {
      result.current.open(old)
      result.current.open(next)
    })
    act(() => submit(old, { url: '/old', text: '' }))
    expect(old.insert).not.toHaveBeenCalled()
    act(() => result.current.cancel(next))
    act(() => submit(next, { url: '/next', text: '' }))
    expect(next.insert).not.toHaveBeenCalled()
    act(() => result.current.open(next))
    unmount()
    submit(next, { url: '/next', text: '' })
    expect(next.insert).not.toHaveBeenCalled()
    expect(next.invalidate).toHaveBeenCalledOnce()
  })

  it('prevents duplicate submission', () => {
    const { result } = renderHook(() => useSlashUrlDialog('a.md'))
    const request = createRequest()
    act(() => result.current.open(request))
    act(() => {
      result.current.submit(request, { url: '/once', text: '' })
      result.current.submit(request, { url: '/once', text: '' })
    })
    expect(request.insert).toHaveBeenCalledOnce()
  })
})
