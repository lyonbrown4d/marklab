import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RightSidebarOutlinePanel,
  type SidebarHeading,
} from '@/components/RightSidebarOutlinePanel'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const outline: SidebarHeading[] = [
  { level: 1, text: 'Introduction', slug: 'introduction' },
  { level: 2, text: 'Setup', slug: 'setup' },
  { level: 3, text: 'Advanced Setup', slug: 'advanced-setup' },
  { level: 2, text: 'Usage', slug: 'usage' },
  { level: 1, text: 'Appendix', slug: 'appendix' },
]

const renderPanel = (
  overrides: Partial<React.ComponentProps<typeof RightSidebarOutlinePanel>> = {},
) => {
  const props = {
    activeHeadingSlug: null,
    onOpenHeading: vi.fn(),
    outline,
    targetLabel: 'Guide',
    ...overrides,
  }
  return { ...render(<RightSidebarOutlinePanel {...props} />), props }
}

beforeEach(async () => {
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
  vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear()
})

describe('RightSidebarOutlinePanel', () => {
  it('marks the active heading and scrolls a newly active row into view', async () => {
    const { rerender } = renderPanel({ activeHeadingSlug: 'introduction' })
    const introduction = screen.getByText('Introduction').closest('button')
    expect(introduction).toHaveAttribute('aria-current', 'location')

    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear()
    rerender(
      <RightSidebarOutlinePanel
        activeHeadingSlug="advanced-setup"
        onOpenHeading={vi.fn()}
        outline={outline}
        targetLabel="Guide"
      />,
    )

    const activeRow = screen.getByText('Advanced Setup').closest('button')
    expect(activeRow).toHaveAttribute('aria-current', 'location')
    expect(introduction).not.toHaveAttribute('aria-current')
    await waitFor(() =>
      expect(activeRow?.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }),
    )
  })

  it('collapses and expands a heading branch without hiding later peers', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Introduction' }))

    expect(screen.queryByText('Setup')).not.toBeInTheDocument()
    expect(screen.queryByText('Advanced Setup')).not.toBeInTheDocument()
    expect(screen.queryByText('Usage')).not.toBeInTheDocument()
    expect(screen.getByText('Appendix')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand Introduction' }))
    expect(screen.getByText('Advanced Setup')).toBeInTheDocument()
  })

  it('collapses a nested branch without hiding its parent peers', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse Setup' }))

    expect(screen.queryByText('Advanced Setup')).not.toBeInTheDocument()
    expect(screen.getByText('Usage')).toBeInTheDocument()
    expect(screen.getByText('Appendix')).toBeInTheDocument()
  })

  it('keeps collapsed descendants discoverable and navigable during search', async () => {
    const onOpenHeading = vi.fn()
    renderPanel({ onOpenHeading })
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Introduction' }))

    await userEvent.type(screen.getByRole('searchbox'), 'advanced')
    const match = screen.getByText('Advanced Setup')
    expect(match).toBeInTheDocument()

    await userEvent.click(match)
    expect(onOpenHeading).toHaveBeenCalledWith('advanced-setup')
  })

  it('reveals a collapsed branch when the caret moves into a descendant', async () => {
    const { rerender } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Introduction' }))

    rerender(
      <RightSidebarOutlinePanel
        activeHeadingSlug="advanced-setup"
        onOpenHeading={vi.fn()}
        outline={outline}
        targetLabel="Guide"
      />,
    )

    const activeRow = await screen.findByText('Advanced Setup')
    expect(activeRow.closest('button')).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('button', { name: 'Collapse Introduction' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('preserves valid collapse state and removes stale branches as the outline changes', async () => {
    const { rerender } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse Introduction' }))
    expect(screen.queryByText('Setup')).not.toBeInTheDocument()

    rerender(
      <RightSidebarOutlinePanel
        activeHeadingSlug={null}
        onOpenHeading={vi.fn()}
        outline={[...outline, { level: 1, text: 'References', slug: 'references' }]}
        targetLabel="Guide"
      />,
    )
    expect(screen.queryByText('Setup')).not.toBeInTheDocument()

    rerender(
      <RightSidebarOutlinePanel
        activeHeadingSlug={null}
        onOpenHeading={vi.fn()}
        outline={[outline[0], outline[4]]}
        targetLabel="Guide"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Expand Introduction' })).not.toBeInTheDocument()

    rerender(
      <RightSidebarOutlinePanel
        activeHeadingSlug={null}
        onOpenHeading={vi.fn()}
        outline={outline}
        targetLabel="Guide"
      />,
    )
    expect(screen.getByText('Setup')).toBeInTheDocument()
  })
})
