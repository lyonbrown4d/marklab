import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownDefaultAppPrompt from '@/components/MarkdownDefaultAppPrompt'

const runtime = vi.hoisted(() => ({ desktop: true, getPlatform: vi.fn() }))
const notifications = vi.hoisted(() => ({ show: vi.fn() }))
const translate = (key: string) => key

vi.mock('sonner', () => ({ toast: notifications.show }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: translate }) }))
vi.mock('@/runtime/electron', () => ({
  isElectronRuntime: () => runtime.desktop,
  getElectronRuntime: () => ({ platform: { get: runtime.getPlatform } }),
}))

const openInstructions = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'defaultAppPrompt.title' }))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  runtime.desktop = true
  runtime.getPlatform.mockReset().mockResolvedValue({ platform: 'windows' })
  notifications.show.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('on-demand Markdown default app instructions', () => {
  it('does not interrupt the user or request platform information on mount', async () => {
    render(<MarkdownDefaultAppPrompt />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(notifications.show).not.toHaveBeenCalled()
    expect(runtime.getPlatform).not.toHaveBeenCalled()
  })

  it('shows platform instructions only after an explicit click', async () => {
    render(<MarkdownDefaultAppPrompt />)
    await openInstructions()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('defaultAppPrompt.instructions.windows')).toHaveAttribute(
      'aria-busy',
      'false',
    )
    expect(runtime.getPlatform).toHaveBeenCalledOnce()
  })

  it('closes through the existing accessible dialog control', async () => {
    render(<MarkdownDefaultAppPrompt />)
    await openInstructions()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps generic instructions available while platform information loads', async () => {
    runtime.getPlatform.mockReturnValue(new Promise(() => {}))
    render(<MarkdownDefaultAppPrompt />)
    await openInstructions()
    expect(screen.getByText('defaultAppPrompt.instructions.unknown')).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('uses generic instructions when platform detection fails', async () => {
    runtime.getPlatform.mockRejectedValue(new Error('Platform unavailable'))
    render(<MarkdownDefaultAppPrompt />)
    await openInstructions()
    expect(screen.getByText('defaultAppPrompt.instructions.unknown')).toHaveAttribute(
      'aria-busy',
      'false',
    )
  })

  it('ignores a stale platform request after closing and reopening', async () => {
    let finishPrevious: (info: { platform: string }) => void = () => {}
    runtime.getPlatform
      .mockImplementationOnce(
        () =>
          new Promise<{ platform: string }>((resolve) => {
            finishPrevious = resolve
          }),
      )
      .mockResolvedValueOnce({ platform: 'linux' })
    render(<MarkdownDefaultAppPrompt />)
    await openInstructions()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await openInstructions()
    await act(async () => {
      finishPrevious({ platform: 'windows' })
    })
    expect(screen.getByText('defaultAppPrompt.instructions.linux')).toBeInTheDocument()
    expect(screen.queryByText('defaultAppPrompt.instructions.windows')).not.toBeInTheDocument()
  })

  it('does not expose a desktop action outside Electron', () => {
    runtime.desktop = false
    render(<MarkdownDefaultAppPrompt />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(runtime.getPlatform).not.toHaveBeenCalled()
  })
})
