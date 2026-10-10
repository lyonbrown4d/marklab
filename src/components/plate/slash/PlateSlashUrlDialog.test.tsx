import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionItemKind } from 'vscode-languageserver-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import { PlateSlashUrlDialog } from '@/components/plate/slash/PlateSlashUrlDialog'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'
import type { PlateSlashUrlInsertionRequest } from '@/components/plate/slash/types'
import { usePlateSlashUrlDialog } from '@/components/plate/slash/usePlateSlashUrlDialog'

const createRequest = (): PlateSlashUrlInsertionRequest => ({
  initialText: '',
  insert: vi.fn(),
  invalidate: vi.fn(),
  kind: 'link',
  restoreFocus: vi.fn(),
})

const Harness = ({
  client = null,
  request,
}: {
  client?: MarkdownLinkCompletionClient | null
  request: PlateSlashUrlInsertionRequest
}) => {
  const state = usePlateSlashUrlDialog('notes/today.md')
  return (
    <>
      <button onClick={() => state.open(request)}>Open</button>
      <PlateSlashUrlDialog
        activePath="notes/today.md"
        completionClient={client}
        labels={labels}
        state={state}
      />
    </>
  )
}

describe('Plate slash URL dialog', () => {
  beforeEach(() => {
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
  })

  it('offers local files and submits the selected relative path', async () => {
    const request = createRequest()
    const client: MarkdownLinkCompletionClient = {
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
    }
    const user = userEvent.setup()
    render(<Harness client={client} request={request} />)

    await user.click(screen.getByText('Open'))
    const url = screen.getByLabelText(labels.linkUrlPrompt)
    await user.type(url, 'gui')
    await user.click(await screen.findByRole('option', { name: /Guide/ }))
    await user.click(screen.getByRole('button', { name: labels.link }))

    expect(request.insert).toHaveBeenCalledWith({ text: '', url: '../docs/guide.md' })
    expect(request.restoreFocus).toHaveBeenCalledOnce()
  })

  it('keeps the dialog open when Enter confirms IME composition', async () => {
    const request = createRequest()
    const user = userEvent.setup()
    render(<Harness request={request} />)
    await user.click(screen.getByText('Open'))
    const url = screen.getByLabelText(labels.linkUrlPrompt)
    await user.type(url, './中文')

    fireEvent.compositionStart(url)
    await act(async () => {
      fireEvent.keyDown(url, { isComposing: true, key: 'Enter' })
    })

    expect(request.insert).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)

    await user.click(screen.getByRole('button', { name: labels.cancel }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
    expect(request.invalidate).toHaveBeenCalledOnce()
  })
})
