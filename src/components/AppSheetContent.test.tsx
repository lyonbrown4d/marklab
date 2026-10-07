import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppSheetContent } from '@/components/AppSheetContent'
import { Sheet, SheetTitle } from '@/components/ui/sheet'

describe('AppSheetContent', () => {
  it('marks a composed non-modal drawer so the scoped overlay rule can hide it', () => {
    render(
      <Sheet open>
        <AppSheetContent showOverlay={false}>
          <SheetTitle>Workspace</SheetTitle>
        </AppSheetContent>
      </Sheet>,
    )

    const content = document.querySelector('[data-slot="sheet-content"]')
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(content).toHaveAttribute('data-overlay', 'hidden')
    expect(overlay).toBeInTheDocument()
    expect(overlay?.nextElementSibling).toBe(content)
  })
})
