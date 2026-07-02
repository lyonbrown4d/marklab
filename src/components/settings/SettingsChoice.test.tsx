import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsChoiceButton, SettingsChoiceGrid } from '@/components/settings/SettingsChoice'

const renderChoiceGrid = (props?: {
  onCompact?: () => void
  onComfortable?: () => void
  onSpacious?: () => void
}) => {
  return render(
    <SettingsChoiceGrid aria-label="Density">
      <SettingsChoiceButton selected={false} onClick={props?.onCompact}>
        Compact
      </SettingsChoiceButton>
      <SettingsChoiceButton selected onClick={props?.onComfortable}>
        Comfortable
      </SettingsChoiceButton>
      <SettingsChoiceButton selected={false} onClick={props?.onSpacious}>
        Spacious
      </SettingsChoiceButton>
    </SettingsChoiceGrid>,
  )
}

describe('SettingsChoice', () => {
  it('exposes a named radio group with one tabbable selected choice', () => {
    renderChoiceGrid()

    expect(screen.getByRole('radiogroup', { name: 'Density' })).toBeInTheDocument()

    const compact = screen.getByRole('radio', { name: 'Compact' })
    const comfortable = screen.getByRole('radio', { name: 'Comfortable' })
    const spacious = screen.getByRole('radio', { name: 'Spacious' })

    expect(compact).not.toBeChecked()
    expect(comfortable).toBeChecked()
    expect(spacious).not.toBeChecked()
    expect(compact).toHaveAttribute('tabindex', '-1')
    expect(comfortable).toHaveAttribute('tabindex', '0')
    expect(spacious).toHaveAttribute('tabindex', '-1')
  })

  it('moves focus and selects the next choice with arrow keys', async () => {
    const user = userEvent.setup()
    const onCompact = vi.fn()
    const onSpacious = vi.fn()

    renderChoiceGrid({ onCompact, onSpacious })

    const compact = screen.getByRole('radio', { name: 'Compact' })
    const comfortable = screen.getByRole('radio', { name: 'Comfortable' })
    const spacious = screen.getByRole('radio', { name: 'Spacious' })

    comfortable.focus()
    await user.keyboard('{ArrowRight}')

    expect(spacious).toHaveFocus()
    expect(onSpacious).toHaveBeenCalledTimes(1)

    await user.keyboard('{ArrowRight}')

    expect(compact).toHaveFocus()
    expect(onCompact).toHaveBeenCalledTimes(1)
  })

  it('skips disabled choices during keyboard navigation', async () => {
    const user = userEvent.setup()
    const onSpacious = vi.fn()

    render(
      <SettingsChoiceGrid aria-label="Density">
        <SettingsChoiceButton selected>Compact</SettingsChoiceButton>
        <SettingsChoiceButton selected={false} disabled>
          Comfortable
        </SettingsChoiceButton>
        <SettingsChoiceButton selected={false} onClick={onSpacious}>
          Spacious
        </SettingsChoiceButton>
      </SettingsChoiceGrid>,
    )

    screen.getByRole('radio', { name: 'Compact' }).focus()
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('radio', { name: 'Spacious' })).toHaveFocus()
    expect(onSpacious).toHaveBeenCalledTimes(1)
  })
})
