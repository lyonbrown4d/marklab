import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TabsBarViewModeControls } from '@/components/TabsBarViewModeControls'

describe('TabsBarViewModeControls', () => {
  it('offers only WYSIWYG and source editor modes', async () => {
    const onChangeView = vi.fn()
    render(
      <TabsBarViewModeControls
        active
        groupLabel="Editing Mode"
        sourceLabel="Source"
        viewMode="wysiwyg"
        wysiwygLabel="WYSIWYG"
        onChangeView={onChangeView}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Editing Mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'WYSIWYG' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radio', { name: /graph|map/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Source' }))
    expect(onChangeView).toHaveBeenCalledWith('source')
  })

  it.each(['preview'] as const)(
    'leaves editor toggles unselected for %s and allows switching to WYSIWYG',
    async (viewMode) => {
      const onChangeView = vi.fn()
      render(
        <TabsBarViewModeControls
          active
          groupLabel="Editing Mode"
          sourceLabel="Source"
          viewMode={viewMode}
          wysiwygLabel="WYSIWYG"
          onChangeView={onChangeView}
        />,
      )

      expect(screen.getByRole('radio', { name: 'WYSIWYG' })).toHaveAttribute(
        'aria-checked',
        'false',
      )
      expect(screen.getByRole('radio', { name: 'Source' })).toHaveAttribute('aria-checked', 'false')

      await userEvent.click(screen.getByRole('radio', { name: 'WYSIWYG' }))
      expect(onChangeView).toHaveBeenCalledWith('wysiwyg')
    },
  )

  it('keeps the current mode selected and keyboard reachable', async () => {
    const onChangeView = vi.fn()
    const user = userEvent.setup()
    render(
      <TabsBarViewModeControls
        active
        groupLabel="Editing Mode"
        sourceLabel="Source"
        viewMode="wysiwyg"
        wysiwygLabel="WYSIWYG"
        onChangeView={onChangeView}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: 'Editing Mode' })
    const wysiwyg = screen.getByRole('radio', { name: 'WYSIWYG' })
    await user.tab()
    expect(group).toBeInTheDocument()
    expect(wysiwyg).toHaveFocus()

    await user.click(wysiwyg)
    expect(onChangeView).not.toHaveBeenCalled()
  })

  it('uses measurable tooltip anchors without replacing toggle state', () => {
    render(
      <TabsBarViewModeControls
        active
        groupLabel="Editing Mode"
        sourceLabel="Source"
        viewMode="wysiwyg"
        wysiwygLabel="WYSIWYG"
        onChangeView={vi.fn()}
      />,
    )

    const wysiwyg = screen.getByRole('radio', { name: 'WYSIWYG' })
    const source = screen.getByRole('radio', { name: 'Source' })

    expect(wysiwyg).toHaveAttribute('data-state', 'on')
    expect(source).toHaveAttribute('data-state', 'off')
    expect(wysiwyg.parentElement).toHaveClass('inline-flex')
    expect(source.parentElement).toHaveClass('inline-flex')
    expect(wysiwyg.closest('.contents')).toBeNull()
    expect(source.closest('.contents')).toBeNull()
  })
})
