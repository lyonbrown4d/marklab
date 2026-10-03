import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPlateSlashCommands } from '@/components/plate/slash/plateSlashCommands'
import { PlateSlashMenu } from '@/components/plate/slash/PlateSlashMenu'
import { plateSlashTestLabels as labels } from '@/components/plate/slash/testFixtures'

describe('PlateSlashMenu', () => {
  it('renders accessible grouped commands and selects one without stealing pointer focus', async () => {
    const onSelect = vi.fn()
    const commands = createPlateSlashCommands(labels).filter(({ key }) =>
      ['h1', 'bulletList', 'mermaid'].includes(key),
    )
    const user = userEvent.setup()
    render(
      <PlateSlashMenu
        anchor={{ left: 20, top: 40 }}
        commands={commands}
        labels={labels}
        onDismiss={vi.fn()}
        onSelect={onSelect}
        onSelectedIndexChange={vi.fn()}
        open
        selectedIndex={0}
      />,
    )

    expect(screen.getByText(labels.textGroup)).toBeInTheDocument()
    expect(screen.getByText(labels.listGroup)).toBeInTheDocument()
    expect(screen.getByText(labels.advancedGroup)).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: labels.mermaid }))
    expect(onSelect).toHaveBeenCalledWith(commands[2])
  })

  it('shows an explicit empty result', () => {
    render(
      <PlateSlashMenu
        anchor={{ left: 0, top: 0 }}
        commands={[]}
        labels={labels}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        onSelectedIndexChange={vi.fn()}
        open
        selectedIndex={0}
      />,
    )

    expect(screen.getByText(labels.noResults)).toBeInTheDocument()
  })

  it('dismisses from an outside interaction', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <PlateSlashMenu
        anchor={{ left: 0, top: 0 }}
        commands={createPlateSlashCommands(labels).slice(0, 2)}
        labels={labels}
        onDismiss={onDismiss}
        onSelect={vi.fn()}
        onSelectedIndexChange={vi.fn()}
        open
        selectedIndex={0}
      />,
    )

    await user.click(document.body)

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('keeps cmdk highlight synchronized and scrolls keyboard selection into view', () => {
    const commands = createPlateSlashCommands(labels).filter(({ key }) =>
      ['h1', 'bulletList', 'mermaid'].includes(key),
    )
    const onSelectedIndexChange = vi.fn()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const { rerender } = render(
      <PlateSlashMenu
        anchor={{ left: 0, top: 0 }}
        commands={commands}
        labels={labels}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        onSelectedIndexChange={onSelectedIndexChange}
        open
        selectedIndex={0}
      />,
    )

    fireEvent.pointerMove(screen.getByRole('option', { name: labels.mermaid }))
    expect(onSelectedIndexChange).toHaveBeenCalledWith(2)

    rerender(
      <PlateSlashMenu
        anchor={{ left: 0, top: 0 }}
        commands={commands}
        labels={labels}
        onDismiss={vi.fn()}
        onSelect={vi.fn()}
        onSelectedIndexChange={onSelectedIndexChange}
        open
        selectedIndex={2}
      />,
    )

    expect(screen.getByRole('option', { name: labels.mermaid })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
