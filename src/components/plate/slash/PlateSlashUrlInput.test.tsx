import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionItemKind } from 'vscode-languageserver-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import { PlateSlashUrlInput } from '@/components/plate/slash/PlateSlashUrlInput'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import type { PlateSlashUrlInsertionRequest } from '@/components/plate/slash/types'
import { usePlateSlashUrlInput } from '@/components/plate/slash/usePlateSlashUrlInput'

const createRequest = (): PlateSlashUrlInsertionRequest => ({
  initialText: '',
  insert: vi.fn(),
  invalidate: vi.fn(),
  kind: 'link',
  restoreFocus: vi.fn(),
})

const createClient = (): MarkdownLinkCompletionClient => ({
  changeDocument: vi.fn().mockImplementation(async ({ version }) => ({ ok: true, version })),
  closeDocument: vi.fn().mockResolvedValue({ ok: true }),
  completion: vi.fn().mockResolvedValue({
    isIncomplete: false,
    items: [
      {
        insertText: '../docs/guide.md',
        kind: CompletionItemKind.File,
        label: 'Guide',
      },
    ],
  }),
  openDocument: vi.fn().mockResolvedValue({ ok: true, version: 1 }),
})

const Harness = ({
  client = null,
  request,
}: {
  client?: MarkdownLinkCompletionClient | null
  request: PlateSlashUrlInsertionRequest
}) => {
  const state = usePlateSlashUrlInput('notes/today.md')
  return (
    <>
      <button onClick={() => state.open(request)}>Open</button>
      <PlateSlashUrlInput
        key={state.requestId}
        activePath="notes/today.md"
        completionClient={client}
        labels={labels}
        state={state}
      />
    </>
  )
}

describe('Plate slash URL input', () => {
  beforeEach(() => {
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
  })

  it('offers local files and submits the selected relative path', async () => {
    const request = createRequest()
    const client = createClient()
    const user = userEvent.setup()
    render(<Harness client={client} request={request} />)

    await user.click(screen.getByText('Open'))
    const url = screen.getByLabelText(labels.linkUrlPrompt)
    await user.type(url, 'gui')
    await user.click(await screen.findByRole('option', { name: /Guide/ }))

    expect(request.insert).toHaveBeenCalledWith({ text: 'Guide', url: '../docs/guide.md' })
    expect(request.restoreFocus).toHaveBeenCalledOnce()
  })

  it('keeps the input open when Enter confirms IME composition', async () => {
    const request = createRequest()
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    const url = screen.getByLabelText(labels.linkUrlPrompt)
    await user.type(url, './中文')

    fireEvent.compositionStart(url)
    await act(async () => {
      fireEvent.keyDown(url, { isComposing: true, key: 'Enter' })
      fireEvent.keyDown(url, { isComposing: false, key: 'Enter' })
      fireEvent.keyDown(url, { isComposing: true, key: 'Escape' })
    })

    expect(request.insert).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.compositionEnd(url)
    fireEvent.keyDown(url, { keyCode: 229, key: 'Enter' })
    expect(request.insert).not.toHaveBeenCalled()
  })

  it('shows insertion errors and allows a single retry', async () => {
    const request = createRequest()
    vi.mocked(request.insert).mockImplementationOnce(() => {
      throw new Error('stale')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    await user.type(screen.getByLabelText(labels.linkUrlPrompt), './note.md')

    await user.click(screen.getByRole('button', { name: labels.link }))
    expect(await screen.findByText(labels.insertionError)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: labels.link }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(request.insert).toHaveBeenCalledTimes(2)
  })

  it('invalidates a cancelled insertion request', async () => {
    const request = createRequest()
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal', 'true')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
    expect(request.invalidate).toHaveBeenCalledOnce()
    expect(request.restoreFocus).toHaveBeenCalledOnce()
  })

  it.each(['{Enter}', '{Tab}'])(
    'accepts a highlighted file with %s and preserves selected text',
    async (key) => {
      const request = { ...createRequest(), initialText: 'Existing text' }
      const user = userEvent.setup()
      render(<Harness client={createClient()} request={request} />)
      await user.click(screen.getByText('Open'))
      const input = screen.getByRole('combobox', { name: labels.linkUrlPrompt })
      await user.type(input, 'gui')
      await screen.findByRole('option', { name: /Guide/ })
      await user.keyboard(' ')
      expect(request.insert).not.toHaveBeenCalled()
      await screen.findByRole('option', { name: /Guide/ })
      await user.keyboard('{ArrowDown}')
      await user.keyboard(key)
      await waitFor(() =>
        expect(request.insert).toHaveBeenCalledWith({
          text: 'Existing text',
          url: '../docs/guide.md',
        }),
      )
      expect(request.insert).toHaveBeenCalledOnce()
    },
  )

  it('allows typing an address after workspace suggestions fail', async () => {
    const request = createRequest()
    const client = createClient()
    vi.mocked(client.completion).mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<Harness client={client} request={request} />)
    await user.click(screen.getByText('Open'))
    await user.type(
      screen.getByRole('combobox', { name: labels.linkUrlPrompt }),
      'https://example.com',
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/.+/))
    await waitFor(() => expect(client.completion).toHaveBeenCalled())
    await user.keyboard('{Enter}')
    expect(request.insert).toHaveBeenCalledWith({ text: '', url: 'https://example.com' })
  })

  it('dismisses on outside interaction without moving focus back to the editor', async () => {
    const request = createRequest()
    const user = userEvent.setup()
    render(
      <>
        <Harness request={request} />
        <button>Outside</button>
      </>,
    )
    await user.click(screen.getByText('Open'))
    await user.click(screen.getByText('Outside'))
    expect(screen.getByText('Outside')).toHaveFocus()
    expect(request.restoreFocus).not.toHaveBeenCalled()
    expect(request.invalidate).toHaveBeenCalledOnce()
    expect(request.insert).not.toHaveBeenCalled()
  })

  it('uses the same inline input for an image address and description', async () => {
    const request = { ...createRequest(), kind: 'image-url' as const }
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    await user.type(screen.getByRole('combobox', { name: labels.imageUrlPrompt }), './figure.png')
    await user.type(screen.getByLabelText(labels.imageAltPrompt), 'Figure')
    await user.click(screen.getByRole('button', { name: labels.imageUrl }))
    expect(request.insert).toHaveBeenCalledWith({ text: 'Figure', url: './figure.png' })
  })

  it('can confirm a typed address with the submit button while file candidates exist', async () => {
    const request = createRequest()
    const user = userEvent.setup()
    render(<Harness client={createClient()} request={request} />)
    await user.click(screen.getByText('Open'))
    await user.type(screen.getByRole('combobox', { name: labels.linkUrlPrompt }), './custom.md')
    await screen.findByRole('option', { name: /Guide/ })
    await user.click(screen.getByLabelText(labels.linkTextPrompt))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: labels.link })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(request.insert).toHaveBeenCalledWith({ text: '', url: './custom.md' })
  })
})
