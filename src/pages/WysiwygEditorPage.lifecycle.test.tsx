import { act, render, waitFor } from '@testing-library/react'
import { forwardRef, useEffect, useImperativeHandle } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/editor/markdownEditorTypes'
import { WorkspacePaneContext, type WorkspacePane } from '@/features/workbench/paneContext'
import { requestExportContent } from '@/utils/exportContent'
import WysiwygEditorPage from '@/pages/WysiwygEditorPage'

const { serialize } = vi.hoisted(() => ({ serialize: vi.fn<(value: string) => Promise<string>>() }))
vi.mock('@/components/MarkdownEditor', () => ({
  default: forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
    ({ value, onStatusChange }, ref) => {
      useImperativeHandle(ref, () => ({ focus: vi.fn(), getMarkdown: () => serialize(value) }))
      useEffect(() => onStatusChange?.({ phase: 'ready' }), [onStatusChange])
      return <div>{value}</div>
    },
  ),
}))
vi.mock('@/pages/hooks/useWorkspaceLinkNavigation', () => ({
  useWorkspaceLinkNavigation: () => ({ openLink: vi.fn(), pending: false }),
}))
vi.mock('@/components/editor/useMarkdownEditorSlashLabels', () => ({
  useMarkdownEditorSlashLabels: () => ({}),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const flushers = new Map<string, () => Promise<void>>()
const pane = (id: string, active = true): WorkspacePane => ({
  id,
  active,
  visible: true,
  recoveryKey: 0,
  openFile: vi.fn(),
  openBeside: vi.fn(),
  registerFlush: (flush) => {
    flushers.set(id, flush)
    return () => {
      if (flushers.get(id) === flush) flushers.delete(id)
    }
  },
})
const page = (scope: WorkspacePane, value: string, onChange = vi.fn(), path = 'shared.md') => (
  <WorkspacePaneContext.Provider value={scope}>
    <WysiwygEditorPage
      activePath={path}
      files={[]}
      value={value}
      onChange={onChange}
      onOpenFile={vi.fn()}
      showStatusBar={false}
      readOnly={false}
    />
  </WorkspacePaneContext.Provider>
)
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

beforeEach(() => {
  flushers.clear()
  serialize.mockReset().mockImplementation(async (value) => value)
})

describe('workbench Markdown editor lifecycle', () => {
  it('exports only the active pane when two panes show the same path', async () => {
    render(
      <>
        {page(pane('passive', false), 'Passive tree')}
        {page(pane('active'), 'Active tree')}
      </>,
      { wrapper },
    )
    await waitFor(() => expect(flushers.size).toBe(2))
    await expect(
      requestExportContent('fallback', { expectedActivePath: 'shared.md', timeoutMs: 10 }),
    ).resolves.toBe('Active tree')
    expect(serialize).toHaveBeenCalledExactlyOnceWith('Active tree')
  })

  it('awaits serialization and commits to the original document callback across a path change', async () => {
    let resolve!: (value: string) => void
    serialize.mockReturnValue(
      new Promise<string>((done) => {
        resolve = done
      }),
    )
    const oldChange = vi.fn()
    const nextChange = vi.fn()
    const scope = pane('writer')
    const view = render(page(scope, 'old', oldChange, 'old.md'), { wrapper })
    await waitFor(() => expect(flushers.has('writer')).toBe(true))
    const flushing = flushers.get('writer')!()
    expect(oldChange).not.toHaveBeenCalled()
    view.rerender(page(scope, 'next', nextChange, 'next.md'))
    await act(async () => {
      resolve('serialized edit')
      await flushing
    })
    expect(oldChange).toHaveBeenCalledExactlyOnceWith('serialized edit')
    expect(nextChange).not.toHaveBeenCalled()
  })

  it('propagates a failed serialization so activation can preserve the outgoing editor', async () => {
    const onChange = vi.fn()
    render(page(pane('writer'), 'old', onChange), { wrapper })
    await waitFor(() => expect(flushers.has('writer')).toBe(true))
    serialize.mockRejectedValue(new Error('serialization failed'))
    await expect(flushers.get('writer')!()).rejects.toThrow('serialization failed')
    expect(onChange).not.toHaveBeenCalled()
  })
})
