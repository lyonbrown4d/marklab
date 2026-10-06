import { act, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownEditorStatus } from '@/components/editor/markdownEditorTypes'
import type {
  PlateEditorSurfaceHandle,
  PlateEditorSurfaceProps,
} from '@/components/plate/plateEditorSurfaceTypes'

const surfaceMock = vi.hoisted(() => ({
  contentVisible: new Map<string | null, boolean | undefined>(),
  statusCallbacks: new Map<string | null, NonNullable<PlateEditorSurfaceProps['onStatusChange']>>(),
}))

type MockPlateEditorSurfaceProps = PlateEditorSurfaceProps & { contentVisible?: boolean }

vi.mock('@/components/plate/PlateEditorSurface', () => ({
  PlateEditorSurface: forwardRef<PlateEditorSurfaceHandle, MockPlateEditorSurfaceProps>(
    ({ activePath, contentVisible, onStatusChange }, ref) => {
      if (onStatusChange) surfaceMock.statusCallbacks.set(activePath, onStatusChange)
      surfaceMock.contentVisible.set(activePath, contentVisible)
      useImperativeHandle(ref, () => ({
        focus: vi.fn(),
        getEditor: () => null as never,
        getMarkdown: () => Promise.resolve(''),
        openLinkDialog: () => false,
      }))
      return <div data-testid="mock-plate-surface">Partially rendered document</div>
    },
  ),
}))

vi.mock('@/components/EditorContextMenu', () => ({
  EditorContextMenu: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/plate/usePlateEditorContextMenu', () => ({
  usePlateEditorContextMenu: () => ({ getCapabilities: vi.fn(), onAction: vi.fn() }),
}))
vi.mock('@/components/plate/usePlateFocusHeading', () => ({ usePlateFocusHeading: vi.fn() }))
vi.mock('@/components/plate/usePlateInlineAiComposer', () => ({
  usePlateInlineAiComposer: () => ({ isOpen: false }),
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'editor.loadFailed': 'Editor failed to load',
        'editor.loading': 'Loading editor...',
      })[key] ?? key,
  }),
}))
vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (select: (state: Record<string, unknown>) => unknown) =>
    select({
      aiDefaultProviderId: null,
      immersiveFocusMode: false,
      immersiveTypewriterMode: false,
      immersiveZenMode: false,
      markdownAssetImportStrategy: 'copy-to-document-assets',
      motionSmoothScrolling: false,
      shortcutOverrides: {},
    }),
}))

import MarkdownEditor from '@/components/MarkdownEditor'
import type { MarkdownEditorSlashLabels } from '@/components/editor/markdownEditorTypes'

const slashLabels = {} as MarkdownEditorSlashLabels
const renderEditor = (activePath: string) => (
  <MarkdownEditor
    activePath={activePath}
    onChange={vi.fn()}
    placeholder="Write"
    slashLabels={slashLabels}
    value="# Document"
  />
)

const reportStatus = (activePath: string, status: MarkdownEditorStatus) => {
  act(() => surfaceMock.statusCallbacks.get(activePath)?.(status))
}

describe('MarkdownEditor loading gate', () => {
  beforeEach(() => {
    surfaceMock.contentVisible.clear()
    surfaceMock.statusCallbacks.clear()
  })

  it('does not accept a stale ready signal after switching documents', () => {
    const view = render(renderEditor('notes/first.md'))
    expect(surfaceMock.contentVisible.get('notes/first.md')).toBe(false)
    reportStatus('notes/first.md', { phase: 'ready' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(surfaceMock.contentVisible.get('notes/first.md')).toBe(true)

    view.rerender(renderEditor('notes/second.md'))
    expect(screen.getByRole('status')).toHaveTextContent('Loading editor...')
    expect(surfaceMock.contentVisible.get('notes/second.md')).toBe(false)

    reportStatus('notes/first.md', { phase: 'ready' })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(surfaceMock.contentVisible.get('notes/second.md')).toBe(false)

    reportStatus('notes/second.md', { phase: 'ready' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(surfaceMock.contentVisible.get('notes/second.md')).toBe(true)
  })

  it('keeps failed content gated behind an explicit error surface', () => {
    render(renderEditor('notes/broken.md'))

    reportStatus('notes/broken.md', { message: 'Parse failed', phase: 'error' })

    expect(screen.getByRole('alert')).toHaveTextContent('Parse failed')
    expect(surfaceMock.contentVisible.get('notes/broken.md')).toBe(false)
  })
})
