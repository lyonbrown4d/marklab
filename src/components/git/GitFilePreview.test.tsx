import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import enUS from '@/i18n/locales/en-US.json'
import { GitFilePreview } from '@/components/git/GitFilePreview'

const mocks = vi.hoisted(() => ({ openFile: vi.fn(), facade: vi.fn() }))
vi.mock('@/services/gitApi', () => ({ gitApiForWorkspace: mocks.facade }))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => (enUS as Record<string, string>)[key] ?? key }),
}))
vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: (props: { kind: string; readonly: boolean; snapshot: boolean; src: string }) => (
    <div
      data-testid="native-preview"
      data-kind={props.kind}
      data-readonly={String(props.readonly)}
      data-snapshot={String(props.snapshot)}
      data-src={props.src}
    />
  ),
}))
const preview = {
  kind: 'preview',
  path: 'cover.png',
  url: `marklab-asset://local/v1/${'a'.repeat(43)}`,
  label: 'Index',
  readonly: true,
  snapshot: true,
}
const show = (
  file = { path: 'cover.png', section: 'staged' as const },
  reason?: 'binary' | 'unsupported_encoding' | 'too_large',
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <GitFilePreview rootPath="/repo" file={file} reason={reason} />
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.facade.mockReturnValue({ openFile: mocks.openFile })
  mocks.openFile.mockImplementation(async ({ action }) =>
    action === 'preview' ? preview : { kind: 'opened' },
  )
})
describe('Git version-aware file previews', () => {
  it.each([
    'cover.png',
    'book.pdf',
    'report.docx',
    'clip.mp4',
    'song.mp3',
    'flow.drawio',
    'drawing.excalidraw',
  ])('uses the existing internal adapter for %s and preserves snapshot identity', async (path) => {
    mocks.openFile.mockImplementation(async ({ action }) =>
      action === 'preview' ? { ...preview, path } : { kind: 'opened' },
    )
    show({ path, section: 'staged' })
    const surface = await screen.findByTestId('native-preview')
    expect(surface).toHaveAttribute('data-readonly', 'true')
    expect(surface).toHaveAttribute('data-snapshot', 'true')
    expect(surface).toHaveAttribute('data-src', preview.url)
    expect(mocks.openFile).toHaveBeenCalledWith({ path, section: 'staged', action: 'preview' })
    expect(mocks.facade).toHaveBeenCalledWith('/repo')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open in system' }))
    expect(mocks.openFile).toHaveBeenCalledWith({ path, section: 'staged', action: 'system' })
  })
  it('preserves editing capabilities for a supported live worktree file', async () => {
    mocks.openFile.mockResolvedValue({
      ...preview,
      path: 'flow.drawio',
      readonly: false,
      snapshot: false,
      label: 'Working Tree',
    })
    show({ path: 'flow.drawio', section: 'staged' })
    expect(await screen.findByTestId('native-preview')).toHaveAttribute('data-readonly', 'false')
  })
  it('opens unsupported binary files through the system without loading an editor or opening twice', async () => {
    show({ path: 'archive.zip', section: 'staged' }, 'binary')
    expect(await screen.findByRole('status', { name: 'Text diff unavailable' })).toBeInTheDocument()
    expect(mocks.openFile).not.toHaveBeenCalled()
    let release!: (value: unknown) => void
    mocks.openFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const button = screen.getByRole('button', { name: 'Open in system' })
    await userEvent.setup().dblClick(button)
    expect(button).toBeDisabled()
    expect(mocks.openFile).toHaveBeenCalledTimes(1)
    expect(mocks.openFile).toHaveBeenCalledWith({
      path: 'archive.zip',
      section: 'staged',
      action: 'system',
    })
    release({ kind: 'opened' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(screen.queryByTestId('native-preview')).not.toBeInTheDocument()
  })
  it('does not force bytes with a misleading source extension into the source editor', async () => {
    show({ path: 'code.ts', section: 'staged' }, 'binary')
    expect(await screen.findByRole('status', { name: 'Text diff unavailable' })).toBeInTheDocument()
    expect(mocks.openFile).not.toHaveBeenCalled()
    expect(screen.queryByTestId('native-preview')).not.toBeInTheDocument()
  })
  it('reports system-open failures without pretending the file opened', async () => {
    mocks.openFile.mockRejectedValue(new Error('No default application'))
    show({ path: 'archive.zip', section: 'staged' }, 'binary')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open in system' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No default application')
  })
})
