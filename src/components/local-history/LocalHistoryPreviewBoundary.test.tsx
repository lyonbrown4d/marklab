import { fireEvent, render, screen } from '@testing-library/react'
import { lazy, Suspense, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import LocalHistoryPreviewBoundary from '@/components/local-history/LocalHistoryPreviewBoundary'

describe('LocalHistoryPreviewBoundary', () => {
  it('retries a rejected lazy preview with a fresh lazy component type', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const loadPreview = vi.fn(() => {
      if (loadPreview.mock.calls.length === 1) {
        return Promise.reject(new Error('preview chunk failed'))
      }
      return Promise.resolve({ default: () => <div>Preview restored</div> })
    })

    const Harness = () => {
      const [Preview, setPreview] = useState(() => lazy(loadPreview))
      return (
        <LocalHistoryPreviewBoundary
          closeLabel="Close"
          description="Compare versions"
          errorTitle="Could not load preview"
          path="README.md"
          retryLabel="Retry"
          onClose={() => undefined}
          onRetry={() => setPreview(() => lazy(loadPreview))}
        >
          <Suspense fallback={<div>Loading preview</div>}>
            <Preview />
          </Suspense>
        </LocalHistoryPreviewBoundary>
      )
    }

    try {
      render(<Harness />)

      expect(await screen.findByRole('alert')).toHaveTextContent('preview chunk failed')
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(await screen.findByText('Preview restored')).toBeInTheDocument()
      expect(loadPreview).toHaveBeenCalledTimes(2)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('lets the user close a failed preview without propagating the error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onClose = vi.fn()
    const Preview = () => {
      throw new Error('preview chunk failed')
    }

    try {
      render(
        <LocalHistoryPreviewBoundary
          closeLabel="Close"
          description="Compare versions"
          errorTitle="Could not load preview"
          path="README.md"
          retryLabel="Retry"
          onClose={onClose}
          onRetry={() => undefined}
        >
          <Preview />
        </LocalHistoryPreviewBoundary>,
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
      expect(onClose).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })
})
