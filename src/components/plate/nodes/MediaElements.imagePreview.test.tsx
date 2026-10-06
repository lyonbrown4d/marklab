import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveMarkdownAsset = vi.hoisted(() => vi.fn())
const toAssetUrl = vi.hoisted(() => vi.fn())
const fetchLinkPreview = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/fsApi', () => ({ fsApi: { resolveMarkdownAsset, toAssetUrl } }))
vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { fetch: fetchLinkPreview },
}))

import { ResolvedPlateImage } from '@/components/plate/nodes/MediaElements'

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('ResolvedPlateImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ignores a stale relative-image resolution after the document changes', async () => {
    const first = createDeferred<{
      exists: boolean
      is_external: boolean
      media_type: string
      relative_path: string
    }>()
    resolveMarkdownAsset.mockImplementation(({ documentPath }: { documentPath: string }) =>
      documentPath === 'notes/first.md'
        ? first.promise
        : Promise.resolve({
            exists: true,
            is_external: false,
            media_type: 'image/png',
            relative_path: 'notes/second/image.png',
          }),
    )
    toAssetUrl.mockImplementation((path: string) =>
      Promise.resolve({ expires_at_ms: Date.now() + 60_000, url: `marklab-asset://${path}` }),
    )
    const view = render(
      <ResolvedPlateImage alt="Diagram" documentPath="notes/first.md" src="./image.png" />,
    )
    view.rerender(
      <ResolvedPlateImage alt="Diagram" documentPath="notes/second.md" src="./image.png" />,
    )
    expect(await screen.findByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      'marklab-asset://notes/second/image.png',
    )

    await act(async () => {
      first.resolve({
        exists: true,
        is_external: false,
        media_type: 'image/png',
        relative_path: 'notes/first/image.png',
      })
      await first.promise
    })
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      'marklab-asset://notes/second/image.png',
    )
  })

  it('never assigns a remote HTTP URL directly to an image element', async () => {
    const remote = createDeferred<{
      kind: 'image'
      media_type: 'image/png'
      src: string
      url: string
    }>()
    fetchLinkPreview.mockReturnValue(remote.promise)
    render(
      <ResolvedPlateImage
        alt="Remote diagram"
        documentPath="notes/current.md"
        src="https://example.com/diagram.png"
      />,
    )
    expect(screen.queryByRole('img', { name: 'Remote diagram' })).toBeNull()
    expect(document.querySelector('img[src^="http"]')).toBeNull()

    await act(async () => {
      remote.resolve({
        kind: 'image',
        media_type: 'image/png',
        src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        url: 'https://example.com/diagram.png',
      })
      await remote.promise
    })
    expect(screen.getByRole('img', { name: 'Remote diagram' })).toHaveAttribute(
      'src',
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
  })

  it('opens a resolved image in the shared zoomable dialog', async () => {
    resolveMarkdownAsset.mockResolvedValue({
      exists: true,
      is_external: false,
      media_type: 'image/png',
      relative_path: 'notes/architecture.png',
    })
    toAssetUrl.mockResolvedValue({
      expires_at_ms: Date.now() + 60_000,
      url: 'marklab-asset://notes/architecture.png',
    })
    render(
      <ResolvedPlateImage
        alt="Architecture"
        documentPath="notes/current.md"
        src="./architecture.png"
      />,
    )
    await screen.findByRole('img', { name: 'Architecture' })
    const expandButton = screen.getByRole('button', { name: 'Expand image' })
    expect(expandButton).toHaveClass('opacity-0')
    fireEvent.click(expandButton)

    const dialog = screen.getByRole('dialog', { name: 'Architecture' })
    expect(dialog.querySelector('img')).toHaveAttribute(
      'src',
      'marklab-asset://notes/architecture.png',
    )
    expect(screen.getByRole('region', { name: 'Visual zoom level' })).toBeInTheDocument()
  })

  it('does not reopen or reuse dimensions when a direct image key changes', () => {
    const firstSource = 'marklab-asset://images/first.png'
    const secondSource = 'marklab-asset://images/second.png'
    const view = render(<ResolvedPlateImage alt="First" documentPath={null} src={firstSource} />)
    const firstImage = screen.getByRole('img', { name: 'First' })
    Object.defineProperties(firstImage, {
      naturalHeight: { configurable: true, value: 500 },
      naturalWidth: { configurable: true, value: 1000 },
    })
    fireEvent.load(firstImage)
    fireEvent.click(screen.getByRole('button', { name: 'Expand image' }))
    expect(screen.getByRole('dialog', { name: 'First' }).querySelector('img')).toHaveStyle({
      height: '500px',
      width: '1000px',
    })

    view.rerender(<ResolvedPlateImage alt="Second" documentPath={null} src={secondSource} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.rerender(<ResolvedPlateImage alt="First" documentPath={null} src={firstSource} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand image' }))
    expect(screen.getByRole('dialog', { name: 'First' }).querySelector('img')).not.toHaveStyle({
      height: '500px',
      width: '1000px',
    })
  })

  it('does not auto-open the next asynchronously resolved local image', async () => {
    resolveMarkdownAsset.mockImplementation(({ target }: { target: string }) =>
      Promise.resolve({
        exists: true,
        is_external: false,
        media_type: 'image/png',
        relative_path: `notes/${target.slice(2)}`,
      }),
    )
    toAssetUrl.mockImplementation((path: string) =>
      Promise.resolve({ expires_at_ms: Date.now() + 60_000, url: `marklab-asset://${path}` }),
    )
    const view = render(
      <ResolvedPlateImage alt="First" documentPath="notes/current.md" src="./first.png" />,
    )
    await screen.findByRole('img', { name: 'First' })
    fireEvent.click(screen.getByRole('button', { name: 'Expand image' }))
    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument()

    view.rerender(
      <ResolvedPlateImage alt="Second" documentPath="notes/current.md" src="./second.png" />,
    )
    expect(await screen.findByRole('img', { name: 'Second' })).toHaveAttribute(
      'src',
      'marklab-asset://notes/second.png',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
