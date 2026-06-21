import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ExcalidrawEditorSurface from '@/components/previews/ExcalidrawEditorSurface'

import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
    readFile: vi.fn(),
    updateBuffer: vi.fn(),
  },
}))

vi.mock('@excalidraw/excalidraw', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  return {
    Excalidraw: ({
      onChange,
      viewModeEnabled,
    }: {
      onChange?: (...args: unknown[]) => void
      viewModeEnabled?: boolean
    }) =>
      React.createElement(
        'button',
        {
          'data-testid': 'excalidraw-editor',
          'data-view-mode': String(viewModeEnabled),
          onClick: () => onChange?.([{ id: 'one' }], { viewBackgroundColor: '#ffffff' }, {}),
          type: 'button',
        },
        'editor',
      ),
    serializeAsJSON: vi.fn(
      () => '{"type":"excalidraw","version":2,"source":"marklab","elements":[]}',
    ),
  }
})

const renderSurface = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ExcalidrawEditorSurface path="diagram.excalidraw" title="diagram.excalidraw" />
    </QueryClientProvider>,
  )
}

describe('ExcalidrawEditorSurface', () => {
  it('loads a scene and persists explicit saves', async () => {
    vi.mocked(fsApi.readFile).mockResolvedValue('{"type":"excalidraw","version":2,"elements":[]}')
    vi.mocked(fsApi.updateBuffer).mockResolvedValue({
      dirty: false,
      path: 'diagram.excalidraw',
      revision: 1,
    })
    vi.mocked(fsApi.flushBuffers).mockResolvedValue(1)

    renderSurface()

    fireEvent.click(await screen.findByTestId('excalidraw-editor'))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(fsApi.updateBuffer).toHaveBeenCalledWith(
        'diagram.excalidraw',
        '{"type":"excalidraw","version":2,"source":"marklab","elements":[]}',
      )
    })
    expect(fsApi.flushBuffers).toHaveBeenCalled()
  })
})
