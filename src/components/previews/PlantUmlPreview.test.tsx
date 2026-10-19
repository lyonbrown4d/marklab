import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PlantUmlPreview from '@/components/previews/PlantUmlPreview'
import { plantumlApi } from '@/services/plantumlApi'

vi.mock('@/services/plantumlApi', () => ({ plantumlApi: { render: vi.fn() } }))
vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useInViewport: () => [true],
}))
vi.mock('@/components/previews/DiagramPreviewDialog', () => ({
  DiagramPreviewDialog: ({
    onOpenChange,
    visual,
  }: {
    onOpenChange: (open: boolean) => void
    visual: { src: string }
  }) => (
    <div role="dialog" aria-label="Expanded diagram">
      <span>{visual.src}</span>
      <button onClick={() => onOpenChange(false)}>Close diagram</button>
    </div>
  ),
}))

const first = `marklab-asset://local/v1/${'a'.repeat(43)}`
const second = `marklab-asset://local/v1/${'b'.repeat(43)}`
const source = '@startuml\nAlice -> Bob\n@enduml'
const renderPreview = (onActivateEdit?: () => void, value = source) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <PlantUmlPreview source={value} onActivateEdit={onActivateEdit} />
    </QueryClientProvider>,
  )
}

describe('PlantUmlPreview', () => {
  beforeEach(() => {
    vi.mocked(plantumlApi.render).mockReset()
    vi.mocked(plantumlApi.render).mockResolvedValue({
      engineVersion: 'puml-0.2.6',
      pages: [
        { url: first, expires_at_ms: Number.MAX_SAFE_INTEGER },
        { url: second, expires_at_ms: Number.MAX_SAFE_INTEGER },
      ],
      warnings: ['Unsupported style'],
    })
  })

  it('renders native pages, opens zoom, and exposes editing independently', async () => {
    const edit = vi.fn()
    renderPreview(edit)
    expect(await screen.findByRole('img', { name: 'PlantUML preview' })).toHaveAttribute(
      'src',
      first,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit source' }))
    expect(edit).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('combobox', { name: 'Diagram page' }), {
      target: { value: '1' },
    })
    expect(screen.getByRole('img')).toHaveAttribute('src', second)
    fireEvent.click(screen.getByRole('button', { name: 'Expand diagram' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(second)
    fireEvent.click(screen.getByRole('button', { name: 'Close diagram' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Unsupported style')).toBeInTheDocument()
  })

  it('keeps invalid source editable and lets users retry rendering', async () => {
    vi.mocked(plantumlApi.render).mockRejectedValueOnce(new Error('Unsupported syntax'))
    renderPreview(vi.fn())
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported syntax')
    expect(screen.getByRole('button', { name: 'Edit source' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', first))
  })

  it('renews expired native resources before opening the zoom dialog', async () => {
    vi.mocked(plantumlApi.render)
      .mockResolvedValueOnce({
        engineVersion: 'puml-0.2.6',
        pages: [{ url: first, expires_at_ms: 0 }],
        warnings: [],
      })
      .mockResolvedValueOnce({
        engineVersion: 'puml-0.2.6',
        pages: [{ url: second, expires_at_ms: Number.MAX_SAFE_INTEGER }],
        warnings: [],
      })
    renderPreview()
    await screen.findByRole('img')
    fireEvent.click(screen.getByRole('button', { name: 'Expand diagram' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(second)
  })

  it('handles empty and failed image states without enabling read-only editing', async () => {
    const empty = renderPreview(undefined, '')
    expect(screen.getByText('No diagram content')).toBeInTheDocument()
    expect(plantumlApi.render).not.toHaveBeenCalled()
    empty.unmount()
    renderPreview()
    fireEvent.error(await screen.findByRole('img'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the diagram')
    expect(screen.queryByRole('button', { name: 'Edit source' })).not.toBeInTheDocument()
  })
})
