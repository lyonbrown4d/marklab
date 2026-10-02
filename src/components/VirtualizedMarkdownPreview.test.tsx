import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VirtualizedMarkdownPreview } from '@/components/VirtualizedMarkdownPreview'

describe('VirtualizedMarkdownPreview', () => {
  it('renders common Markdown without executing embedded HTML', () => {
    const { container } = render(
      <VirtualizedMarkdownPreview
        activationLabel="Edit section"
        cacheKey={{}}
        markdown={'## Heading\n\n**Bold**\n\n<script>window.evil = true</script>'}
        onActivate={vi.fn()}
      />,
    )

    expect(container.querySelector('h2')?.textContent).toBe('Heading')
    expect(container.querySelector('strong')?.textContent).toBe('Bold')
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>window.evil = true</script>')
  })

  it('activates editing from pointer and keyboard intent', () => {
    const onActivate = vi.fn()
    const { getByTestId } = render(
      <VirtualizedMarkdownPreview
        activationLabel="Edit section"
        cacheKey={{}}
        markdown="Preview"
        onActivate={onActivate}
      />,
    )
    const preview = getByTestId('virtual-markdown-segment-preview')

    preview.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    preview.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    preview.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }))
    preview.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))

    expect(onActivate).toHaveBeenCalledTimes(3)
  })
})
