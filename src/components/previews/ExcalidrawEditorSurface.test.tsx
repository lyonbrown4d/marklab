import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ExcalidrawEditorSurface from '@/components/previews/ExcalidrawEditorSurface'

import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
    readFile: vi.fn(),
    updateBuffer: vi.fn(),
  },
}))

const messages: Record<string, string> = {
  'preview.excalidrawLoading': 'Loading whiteboard...',
  'preview.excalidrawOpenFailedTitle': 'Unable to open whiteboard',
  'preview.excalidrawOpenFallback': 'Unable to open Excalidraw document',
  'preview.excalidrawReadOnly': 'Read only',
  'preview.excalidrawSaved': 'Saved',
  'preview.excalidrawSave': 'Save',
  'preview.excalidrawSaveFailedFallback': 'Unable to save Excalidraw document',
  'preview.excalidrawUnsaved': 'Unsaved changes',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
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
  beforeEach(() => {
    vi.mocked(fsApi.flushBuffers).mockReset()
    vi.mocked(fsApi.readFile).mockReset()
    vi.mocked(fsApi.updateBuffer).mockReset()
  })

  it('uses localized loading status while opening a scene', () => {
    vi.mocked(fsApi.readFile).mockReturnValue(new Promise(() => {}))

    renderSurface()

    expect(screen.getByRole('status')).toHaveTextContent('Loading whiteboard...')
  })

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
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(fsApi.updateBuffer).toHaveBeenCalledWith(
        'diagram.excalidraw',
        '{"type":"excalidraw","version":2,"source":"marklab","elements":[]}',
      )
    })
    expect(fsApi.flushBuffers).toHaveBeenCalled()
  })
})
