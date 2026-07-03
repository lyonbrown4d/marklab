import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RightSidebarKnowledgePanel } from '@/components/RightSidebarKnowledgePanel'
import i18n from '@/i18n/setup'
import type { KnowledgeInsights, KnowledgeMissingReference } from '@/logic/knowledge'
import { usePreferencesStore } from '@/store/usePreferencesStore'

beforeEach(async () => {
  localStorage.clear()
  usePreferencesStore.setState({ locale: 'en-US' })
  await i18n.changeLanguage('en-US')
})

describe('RightSidebarKnowledgePanel', () => {
  it('shows dense knowledge references and opens missing link positions', async () => {
    const missingReference: KnowledgeMissingReference = {
      target: '#lost-heading',
      text: 'missing heading',
      linkType: 'markdown',
      line: 9,
      column: 3,
      context: 'Jump to [missing heading](#lost-heading)',
    }
    const knowledge: KnowledgeInsights = {
      incoming: [
        {
          path: 'notes/source.md',
          label: 'source',
          count: 3,
          firstLine: 7,
          firstColumn: 12,
          firstText: 'Target',
          firstContext: 'See [Target](../target.md) before editing',
        },
      ],
      outgoing: [
        {
          path: 'notes/out.md',
          label: 'out',
          count: 2,
          firstLine: 4,
          firstColumn: 8,
          firstText: 'Outgoing',
          firstContext: 'Read [Outgoing](out.md) first',
        },
      ],
      missing: [missingReference],
      incomingCount: 3,
      outgoingCount: 2,
      missingCount: 1,
      orphan: false,
    }
    const onOpenMissing = vi.fn()

    render(
      <RightSidebarKnowledgePanel
        targetPath="target.md"
        targetLabel="target"
        knowledge={knowledge}
        onOpenFile={vi.fn()}
        onOpenReference={vi.fn()}
        onOpenMissing={onOpenMissing}
      />,
    )

    expect(screen.getByText('2 outgoing references across 1 linked files')).toBeInTheDocument()
    expect(screen.getByText('3 incoming references from 1 source files')).toBeInTheDocument()
    expect(screen.getByText('1 unresolved references in this file')).toBeInTheDocument()
    expect(screen.getAllByText('2 refs').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3 refs').length).toBeGreaterThan(0)
    expect(screen.getByText('First context: Read [Outgoing](out.md) first')).toBeInTheDocument()
    expect(
      screen.getByText('First context: See [Target](../target.md) before editing'),
    ).toBeInTheDocument()
    expect(screen.getByText('L4:C8')).toBeInTheDocument()
    expect(screen.getByText('L7:C12')).toBeInTheDocument()
    expect(screen.getByText('Markdown')).toBeInTheDocument()
    expect(screen.getByText('Target: #lost-heading')).toBeInTheDocument()
    expect(
      screen.getByText('First context: Jump to [missing heading](#lost-heading)'),
    ).toBeInTheDocument()
    expect(screen.getByText('L9:C3')).toBeInTheDocument()
    expect(document.querySelectorAll('.space-y-1')).toHaveLength(0)
    expect(document.querySelectorAll('.min-w-0.flex.flex-1.flex-col.gap-1')).toHaveLength(3)

    const missingButton = screen.getByText('missing heading').closest('button')
    expect(missingButton).toBeInTheDocument()
    fireEvent.click(missingButton!)

    expect(onOpenMissing).toHaveBeenCalledWith(missingReference)
  })
})
