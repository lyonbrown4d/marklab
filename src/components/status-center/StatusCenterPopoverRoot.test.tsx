import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatusCenterPopoverRoot } from '@/components/status-center/StatusCenterPopoverRoot'
import { PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type HostProps = {
  onVisibilityCloseFocus?: () => void
  visible: boolean
}

const Host = ({ onVisibilityCloseFocus, visible }: HostProps) => (
  <>
    <button type="button" data-status-bar-edge-handle>
      Show collapsed status
    </button>
    <StatusCenterPopoverRoot
      key={visible ? 'visible' : 'hidden'}
      visible={visible}
      onVisibilityCloseFocus={onVisibilityCloseFocus}
    >
      {() => (
        <>
          <PopoverTrigger asChild>
            <button type="button">Open status center</button>
          </PopoverTrigger>
          <PopoverContent role="dialog" aria-label="Status Center">
            Status details
          </PopoverContent>
        </>
      )}
    </StatusCenterPopoverRoot>
  </>
)

describe('StatusCenterPopoverRoot', () => {
  it('closes its portal and invokes the configured focus handoff when hidden', () => {
    const onVisibilityCloseFocus = vi.fn()
    const view = render(<Host visible onVisibilityCloseFocus={onVisibilityCloseFocus} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open status center' }))
    expect(screen.getByRole('dialog', { name: 'Status Center' })).toBeInTheDocument()

    view.rerender(<Host visible={false} onVisibilityCloseFocus={onVisibilityCloseFocus} />)

    expect(screen.queryByRole('dialog', { name: 'Status Center' })).not.toBeInTheDocument()
    expect(onVisibilityCloseFocus).toHaveBeenCalledOnce()
  })

  it('moves focus to the collapsed edge handle through its default handoff', async () => {
    const view = render(<Host visible />)

    fireEvent.click(screen.getByRole('button', { name: 'Open status center' }))
    view.rerender(<Host visible={false} />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Show collapsed status' })).toHaveFocus(),
    )
  })
})
