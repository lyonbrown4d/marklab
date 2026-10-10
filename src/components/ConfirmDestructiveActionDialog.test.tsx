import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import { ConfirmDestructiveActionDialog } from '@/components/ConfirmDestructiveActionDialog'

type HarnessProps = {
  onConfirm: () => Promise<void>
}

const Harness = ({ onConfirm }: HarnessProps) => {
  const [open, setOpen] = useState(true)
  const returnFocusRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={returnFocusRef}>Delete OpenAI</button>
      <ConfirmDestructiveActionDialog
        open={open}
        title="Delete provider?"
        description="This permanently removes the provider and its stored configuration:"
        resourceName="OpenAI"
        confirmLabel="Delete provider"
        pendingLabel="Deleting provider…"
        cancelLabel="Cancel"
        returnFocusRef={returnFocusRef}
        onOpenChange={setOpen}
        onConfirm={onConfirm}
      />
    </>
  )
}

const RejectHarness = ({ onConfirm }: HarnessProps) => {
  const [error, setError] = useState<string>()
  const handleConfirm = async () => {
    try {
      await onConfirm()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delete failed')
      throw cause
    }
  }
  return (
    <ConfirmDestructiveActionDialog
      open
      title="Delete provider?"
      description="This permanently removes the provider:"
      resourceName="OpenAI"
      confirmLabel="Delete provider"
      pendingLabel="Deleting provider…"
      cancelLabel="Cancel"
      error={error}
      onOpenChange={() => undefined}
      onConfirm={handleConfirm}
    />
  )
}

describe('ConfirmDestructiveActionDialog', () => {
  beforeEach(() =>
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} }),
  )

  it('protects destructive confirmation from command-palette focus', async () => {
    const { unmount } = render(<Harness onConfirm={vi.fn(async () => undefined)} />)

    await waitFor(() => expect(isCommandPaletteBlockedByActiveSurface()).toBe(true))
    unmount()
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(false)
  })

  it('describes the resource and cancels without invoking the action', async () => {
    const onConfirm = vi.fn(async () => undefined)
    const user = userEvent.setup()
    render(<Harness onConfirm={onConfirm} />)

    expect(screen.getByRole('alertdialog', { name: 'Delete provider?' })).toHaveTextContent(
      'OpenAI',
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete OpenAI' })).toHaveFocus()
  })

  it('announces pending work and prevents duplicate confirmation', async () => {
    let resolveConfirm!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (resolveConfirm = resolve)))
    const user = userEvent.setup()
    render(<Harness onConfirm={onConfirm} />)

    const confirm = screen.getByRole('button', { name: 'Delete provider' })
    await user.dblClick(confirm)

    const pending = screen.getByRole('button', { name: 'Deleting provider…' })
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('aria-busy', 'true')
    expect(pending.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

    resolveConfirm()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('keeps a failed confirmation open and allows an accessible retry', async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error('Provider delete failed')
    })
    const user = userEvent.setup()
    render(<RejectHarness onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Delete provider' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider delete failed')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Delete provider' })
    expect(retry).toBeEnabled()
    expect(retry).toHaveFocus()
    await user.click(retry)
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('uses a connected fallback when the original trigger is removed after success', async () => {
    const FocusHarness = () => {
      const [open, setOpen] = useState(true)
      const [showTrigger, setShowTrigger] = useState(true)
      const triggerRef = useRef<HTMLButtonElement>(null)
      const fallbackRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          {showTrigger && <button ref={triggerRef}>Delete OpenAI</button>}
          <button ref={fallbackRef}>Add provider</button>
          <ConfirmDestructiveActionDialog
            open={open}
            title="Delete provider?"
            description="This permanently removes the provider:"
            resourceName="OpenAI"
            confirmLabel="Delete provider"
            pendingLabel="Deleting provider…"
            cancelLabel="Cancel"
            returnFocusRef={triggerRef}
            fallbackFocusRef={fallbackRef}
            onOpenChange={setOpen}
            onConfirm={async () => setShowTrigger(false)}
          />
        </>
      )
    }
    const user = userEvent.setup()
    render(<FocusHarness />)

    await user.click(screen.getByRole('button', { name: 'Delete provider' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add provider' })).toHaveFocus()
  })
})
