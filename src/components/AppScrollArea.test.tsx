import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ScrollArea } from '@/components/AppScrollArea'

describe('AppScrollArea', () => {
  it('keeps viewport-specific layout on a composed content wrapper', () => {
    const { container } = render(
      <ScrollArea className="h-full" viewportClassName="p-2">
        <span>Document list</span>
      </ScrollArea>,
    )

    expect(container.querySelector('[data-slot="app-scroll-area"]')).toHaveClass('h-full')
    expect(screen.getByText('Document list').parentElement).toHaveClass('p-2')
  })
})
