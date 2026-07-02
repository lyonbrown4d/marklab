import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GitChangeRow } from '@/components/GitChangeRow'
import type { GitFileChange } from '@/services/gitApi'

const createChange = (overrides: Partial<GitFileChange> = {}): GitFileChange =>
  ({
    path: 'docs/guide.md',
    status: 'modified',
    detail: 'working tree',
    ...overrides,
  }) as GitFileChange

describe('GitChangeRow', () => {
  it('exposes a full accessible label and readable status text for the row action', async () => {
    const user = userEvent.setup()
    const onOpenDiff = vi.fn()

    render(
      <GitChangeRow
        change={createChange()}
        section="unstaged"
        onOpenDiff={onOpenDiff}
        diffLabel="Open diff"
        renamedFromLabel="Renamed from"
      />,
    )

    const rowButton = screen.getByRole('button', {
      name: 'Open diff: docs/guide.md (Modified)',
    })
    const detailId = rowButton.getAttribute('aria-describedby')

    expect(screen.getByText('M')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('Modified')).toHaveClass('sr-only')
    expect(detailId).toBeTruthy()
    expect(document.getElementById(detailId ?? '')).toHaveTextContent('working tree')

    await user.click(rowButton)

    expect(onOpenDiff).toHaveBeenCalledWith({
      path: 'docs/guide.md',
      status: 'modified',
      section: 'unstaged',
    })
  })

  it('keeps the icon-only diff action separately named', async () => {
    const user = userEvent.setup()
    const onOpenDiff = vi.fn()

    render(
      <GitChangeRow
        change={createChange()}
        section="staged"
        onOpenDiff={onOpenDiff}
        diffLabel="Open diff"
        renamedFromLabel="Renamed from"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open diff: docs/guide.md' }))

    expect(onOpenDiff).toHaveBeenCalledWith({
      path: 'docs/guide.md',
      status: 'modified',
      section: 'staged',
    })
  })

  it('describes renamed files with their previous path', () => {
    render(
      <GitChangeRow
        change={createChange({
          path: 'docs/new-guide.md',
          old_path: 'docs/guide.md',
          status: 'renamed',
        })}
        section="staged"
        onOpenDiff={vi.fn()}
        diffLabel="Open diff"
        renamedFromLabel="Renamed from"
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Open diff: docs/new-guide.md (Renamed)' }),
    ).toHaveAccessibleDescription('Renamed from: docs/guide.md')
  })
})
