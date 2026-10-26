import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspacePublicationPreview } from '@/components/workspace-publication/WorkspacePublicationPreview'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, number>) => {
      if (key === 'workspaceExport.preview') return 'Document preview'
      if (key === 'workspaceExport.previewPages') return 'Preview pages'
      if (key === 'workspaceExport.zoomLevel') return 'Zoom level'
      if (key === 'workspaceExport.pageOf') return `${values?.current} / ${values?.total}`
      return key
    },
  }),
}))

const options: WorkspacePublicationOptions = {
  cover: false,
  format: 'pdf',
  locale: 'en-US',
  margin: 'normal',
  orientation: 'portrait',
  pageBreaks: true,
  pageNumbers: true,
  pageSize: 'a4',
  tableOfContents: false,
  includeLinkedSpreadsheets: false,
  title: 'Product Guide',
}

const renderPreview = () =>
  render(
    <WorkspacePublicationPreview
      options={options}
      orphanCount={0}
      pages={[
        {
          excerpt: 'A focused chapter preview.',
          kind: 'chapter',
          number: 1,
          path: 'chapter.md',
          title: 'Chapter',
        },
      ]}
      selectedPath="chapter.md"
    />,
  )

describe('WorkspacePublicationPreview trackpad zoom', () => {
  it.each([
    ['Control', { ctrlKey: true }],
    ['Command', { metaKey: true }],
  ])('handles %s-modified trackpad pinch gestures', (_, modifier) => {
    renderPreview()
    const viewport = screen.getByRole('region', { name: 'Preview pages' })
    const event = createEvent.wheel(viewport, {
      cancelable: true,
      deltaY: -100,
      ...modifier,
    })

    fireEvent(viewport, event)

    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByRole('status', { name: 'Zoom level' })).toHaveTextContent('115%')
  })

  it('preserves ordinary two-finger scrolling', () => {
    renderPreview()
    const viewport = screen.getByRole('region', { name: 'Preview pages' })
    const event = createEvent.wheel(viewport, { cancelable: true, deltaY: 100 })

    fireEvent(viewport, event)

    expect(event.defaultPrevented).toBe(false)
    expect(screen.getByRole('status', { name: 'Zoom level' })).toHaveTextContent('85%')
  })
})
