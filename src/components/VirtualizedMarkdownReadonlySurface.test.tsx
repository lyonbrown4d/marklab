import { createEvent, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VirtualizedMarkdownReadonlySurface } from '@/components/VirtualizedMarkdownReadonlySurface'

describe('VirtualizedMarkdownReadonlySurface', () => {
  it('mounts a minimal non-editable ProseMirror view without editor chrome', async () => {
    const { container } = render(
      <VirtualizedMarkdownReadonlySurface
        activationLabel="Edit section"
        cacheKey={{}}
        markdown={'## Heading\n\n**Bold**\n\n<script>window.evil = true</script>'}
        onActivate={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.ProseMirror')).not.toBeNull()
    })

    const editor = container.querySelector<HTMLElement>('.ProseMirror')
    expect(editor?.getAttribute('contenteditable')).toBe('false')
    expect(editor?.getAttribute('aria-readonly')).toBe('true')
    expect(container.querySelector('h2')?.textContent).toBe('Heading')
    expect(container.querySelector('strong')?.textContent).toBe('Bold')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[data-crepe-feature]')).toBeNull()
    expect(container.querySelector('.milkdown-toolbar')).toBeNull()
  })

  it('activates editing from pointer and keyboard intent', () => {
    const onActivate = vi.fn()
    const { getByTestId } = render(
      <VirtualizedMarkdownReadonlySurface
        activationLabel="Edit section"
        cacheKey={{}}
        markdown="Readonly"
        onActivate={onActivate}
      />,
    )
    const surface = getByTestId('virtual-markdown-segment-readonly')

    const pointerDown = createEvent.pointerDown(surface)
    fireEvent(surface, pointerDown)
    fireEvent.keyDown(surface, { key: 'Enter' })
    fireEvent.keyDown(surface, { key: ' ' })
    fireEvent.keyDown(surface, { key: 'ArrowDown' })

    expect(onActivate).toHaveBeenCalledTimes(3)
    expect(pointerDown.defaultPrevented).toBe(true)
  })
})
