import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRecentCommands } from '@/components/command/useRecentCommands'

describe('useRecentCommands', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a bounded, deduplicated most-recent-first command list', () => {
    const { result } = renderHook(() => useRecentCommands())

    act(() => {
      result.current.rememberCommand('settings.open')
      result.current.rememberCommand('view.source')
      result.current.rememberCommand('settings.open')
    })

    expect(result.current.recentCommandIds).toEqual(['settings.open', 'view.source'])
    expect(JSON.parse(localStorage.getItem('marklab.command.recentCommands') ?? '[]')).toEqual([
      'settings.open',
      'view.source',
    ])
  })

  it('persists a command when the palette unmounts in the same interaction', () => {
    const Palette = ({ close }: { close: () => void }) => {
      const { rememberCommand } = useRecentCommands()
      return (
        <button
          onClick={() => {
            rememberCommand('view.toggle_sidebar')
            close()
          }}
        >
          Run command
        </button>
      )
    }
    const Harness = () => {
      const [open, setOpen] = useState(true)
      return open ? <Palette close={() => setOpen(false)} /> : <p>Closed</p>
    }
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Run command' }))

    expect(screen.getByText('Closed')).toBeVisible()
    expect(JSON.parse(localStorage.getItem('marklab.command.recentCommands') ?? '[]')).toEqual([
      'view.toggle_sidebar',
    ])
  })
})
