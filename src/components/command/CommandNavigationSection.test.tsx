import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import CommandNavigationSection, {
  type CommandNavigationBacklink,
  type CommandNavigationHeading,
  type CommandNavigationMissingLink,
  type CommandNavigationOutgoingLink,
} from '@/components/command/CommandNavigationSection'

const messages: Record<string, string> = {
  'command.navigation.backlinks': 'Backlinks',
  'command.navigation.currentHeadings': 'Current headings',
  'command.navigation.missingLinks': 'Missing links',
  'command.navigation.outgoingLinks': 'Outgoing links',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { count?: number }) => {
      if (key === 'command.search.moreHidden') return `${values?.count ?? 0} more hidden`
      return messages[key] ?? key
    },
  }),
}))

vi.mock('@/components/ui/command', () => ({
  CommandGroup: ({ children, heading }: { children: ReactNode; heading: string }) => (
    <section aria-label={heading}>{children}</section>
  ),
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
    value?: string
  }) => (
    <button onClick={() => onSelect?.()} type="button">
      {children}
    </button>
  ),
  CommandSeparator: () => <hr />,
  CommandShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

const defaultCallbacks = () => ({
  onOpenBacklink: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenMissingLink: vi.fn(),
  onOpenOutgoingLink: vi.fn(),
})

const renderNavigation = (
  props: Partial<{
    activePath: string | null
    backlinks: CommandNavigationBacklink[]
    headings: CommandNavigationHeading[]
    missingLinks: CommandNavigationMissingLink[]
    outgoingLinks: CommandNavigationOutgoingLink[]
  }> = {},
) => {
  const callbacks = defaultCallbacks()
  const view = render(
    <CommandNavigationSection
      activePath={'activePath' in props ? (props.activePath ?? null) : 'docs/current.md'}
      backlinks={props.backlinks ?? []}
      headings={props.headings ?? []}
      missingLinks={props.missingLinks ?? []}
      outgoingLinks={props.outgoingLinks ?? []}
      {...callbacks}
    />,
  )

  return { ...callbacks, ...view }
}

const buttonFromText = (text: string) => {
  const button = screen.getByText(text).closest('button')
  if (!button) throw new Error(`Missing button for ${text}`)
  return button
}

describe('CommandNavigationSection', () => {
  it('does not render navigation commands without an active file', () => {
    const { container } = renderNavigation({
      activePath: null,
      headings: [{ level: 1, path: 'docs/current.md', slug: 'intro', text: 'Intro' }],
    })

    expect(container.firstChild).toBeNull()
  })

  it('limits current headings and opens the selected heading', () => {
    const headings = Array.from({ length: 7 }, (_, index) => ({
      level: index + 1,
      path: 'docs/current.md',
      slug: `heading-${index + 1}`,
      text: `Heading ${index + 1}`,
    }))
    const { onOpenHeading } = renderNavigation({ headings })

    expect(screen.getByRole('region', { name: 'Current headings' })).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.queryByText('Heading 7')).toBeNull()
    expect(screen.getByText('1 more hidden')).toBeTruthy()

    fireEvent.click(buttonFromText('Heading 1'))

    expect(onOpenHeading).toHaveBeenCalledWith('docs/current.md', 'heading-1')
  })

  it('opens outgoing links, backlinks, and missing links from localized groups', () => {
    const outgoingLink: CommandNavigationOutgoingLink = {
      column: 4,
      context: 'See the install guide.',
      line: 12,
      linkType: 'markdown',
      sourcePath: 'docs/current.md',
      target: 'docs/Target.md',
      targetHeadingSlug: 'setup',
      targetPath: 'docs/Target.md',
      text: 'Install guide',
    }
    const backlink: CommandNavigationBacklink = {
      column: 9,
      context: 'Linked from source context.',
      line: 3,
      sourcePath: 'refs/Source.md',
      text: 'Current page',
    }
    const missingLink: CommandNavigationMissingLink = {
      column: 2,
      context: 'Broken markdown reference.',
      line: 8,
      linkType: 'markdown',
      path: 'docs/current.md',
      target: 'missing.md',
      text: 'Broken markdown',
    }
    const { onOpenBacklink, onOpenMissingLink, onOpenOutgoingLink } = renderNavigation({
      backlinks: [backlink],
      missingLinks: [missingLink],
      outgoingLinks: [outgoingLink],
    })

    expect(screen.getByRole('region', { name: 'Outgoing links' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Backlinks' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Missing links' })).toBeTruthy()

    fireEvent.click(buttonFromText('Install guide'))
    fireEvent.click(buttonFromText('Linked from source context.'))
    fireEvent.click(buttonFromText('Broken markdown'))

    expect(onOpenOutgoingLink).toHaveBeenCalledWith(outgoingLink)
    expect(onOpenBacklink).toHaveBeenCalledWith(backlink)
    expect(onOpenMissingLink).toHaveBeenCalledWith(missingLink)
  })
})
