import { Code2, FileText } from 'lucide-react'
import { expect, it } from 'vitest'
import { DockTabIcon, getDockTabPresentation } from '@/features/workbench/dockTabPresentation'
import type { DockTab } from '@/features/workbench/dockTypes'

it('distinguishes source, rich editing and preview without changing stored filename titles', () => {
  const labels = { source: '源码', preview: '预览', diff: '差异' }
  const rich: DockTab = {
    id: 'rich',
    route: '/files/edit/notes/Alpha.md',
    title: 'Alpha.md',
    kind: 'document',
  }
  const source = { ...rich, id: 'source', route: '/files/source/notes/Alpha.md' }
  const preview = { ...rich, id: 'preview', route: '/files/preview/notes/Alpha.md' }
  expect(getDockTabPresentation(source, '', labels).label).toBe('Alpha · 源码')
  expect(getDockTabPresentation(rich, '', labels).label).toBe('Alpha')
  expect(getDockTabPresentation(preview, '', labels).label).toBe('Alpha · 预览')
  expect(DockTabIcon({ tab: source }).type).toBe(Code2)
  expect(DockTabIcon({ tab: rich }).type).toBe(FileText)
  expect(source.title).toBe('Alpha.md')
  expect(getDockTabPresentation(undefined, 'Open files', labels).label).toBe('Open files')
})
