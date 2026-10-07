import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CommandSearchStatus from '@/components/command/CommandSearchStatus'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (values?.count !== undefined) return `${key}:${values.count}`
      return key
    },
  }),
}))

type CommandSearchStatusProps = ComponentProps<typeof CommandSearchStatus>

const createProps = (
  overrides: Partial<CommandSearchStatusProps> = {},
): CommandSearchStatusProps => ({
  query: '',
  fullTextFetching: false,
  fullTextError: false,
  workspaceIndexed: true,
  indexedFileCount: 12,
  searchIndexRebuilding: false,
  ...overrides,
})

describe('CommandSearchStatus', () => {
  it('announces index rebuild progress politely', () => {
    render(<CommandSearchStatus {...createProps({ searchIndexRebuilding: true })} />)

    const status = screen.getByRole('status')

    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent('command.search.status.rebuilding')
    expect(status).toHaveClass('bg-primary/5')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('announces full-text search failures assertively', () => {
    render(<CommandSearchStatus {...createProps({ fullTextError: true })} />)

    const alert = screen.getByRole('alert')

    expect(alert).toHaveAttribute('aria-live', 'assertive')
    expect(alert).toHaveTextContent('command.search.status.fullTextError')
    expect(alert).toHaveClass('bg-destructive/10')
  })

  it('keeps the search spinner decorative inside the live region', () => {
    render(<CommandSearchStatus {...createProps({ fullTextFetching: true })} />)

    const status = screen.getByRole('status')

    expect(status).toHaveTextContent('command.search.status.searching')
    expect(status.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('does not render a live region for a valid settled query', () => {
    render(<CommandSearchStatus {...createProps({ query: 'quarterly notes' })} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['rebuilding', { searchIndexRebuilding: true }, 'command.search.status.fullTextRebuilding'],
    ['warming', { workspaceIndexed: false }, 'command.search.status.fullTextWarming'],
    ['failed', { fullTextError: true }, 'command.search.status.fullTextOnlyError'],
    ['ready', {}, 'command.search.status.fullTextReady:12'],
  ])('uses accurate full-text-only copy while %s', (_name, overrides, message) => {
    const props = { ...createProps(overrides), fullTextOnly: true }
    render(<CommandSearchStatus {...props} />)

    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('does not show a full-text minimum hint when full text is excluded', () => {
    const props = { ...createProps({ query: 'a' }), includeFullText: false }
    render(<CommandSearchStatus {...props} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
