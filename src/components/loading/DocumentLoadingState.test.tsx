import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { SplashScreen } from '@/splash/SplashScreen'

describe('shared document loading', () => {
  it('announces one loading state while hiding composing lines from assistive technology', () => {
    render(<DocumentLoadingState label="Loading preview" description="notes/guide.md" />)
    const status = screen.getByRole('status', { name: 'Loading preview' })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('notes/guide.md')
    expect(screen.getByText('notes/guide.md')).toHaveAttribute('title', 'notes/guide.md')
    const lines = status.querySelector('[data-document-loading]')
    expect(lines).toHaveAttribute('aria-hidden', 'true')
    expect(lines?.querySelectorAll('[data-splash-line]')).toHaveLength(3)
  })

  it('offers a compact decorative indicator without an empty description', () => {
    render(<DocumentLoadingState compact label="Preparing editor" />)
    const status = screen.getByRole('status', { name: 'Preparing editor' })
    expect(status.querySelector('[data-document-loading]')).toHaveClass(
      'document-loading-lines--compact',
    )
    expect(status.querySelector('p')).toBeNull()
  })

  it('keeps the splash branding, document composition and original status', () => {
    render(<SplashScreen />)
    expect(screen.getByText('Marklab')).toBeVisible()
    expect(screen.getByText('LOCAL WORKSPACE')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('Preparing workspace…')
    const document = documentForSplash()
    expect(document?.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(document?.querySelector('[data-document-loading]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(document?.querySelectorAll('.splash-caret')).toHaveLength(1)
  })
})

const documentForSplash = () => window.document.querySelector('[data-splash-document]')
