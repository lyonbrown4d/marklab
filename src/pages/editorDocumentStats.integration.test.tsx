import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { KeepAlive } from 'keepalive-for-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppStatusBarProvider, EditorStatusBarSlot } from '@/components/EditorStatusBar'
import SourceCodePage from '@/pages/SourceCodePage'
import WysiwygEditorPage from '@/pages/WysiwygEditorPage'
import type { RpcWorker } from '@/services/workerRpcClient'

type StatsRequest = { content: string; complete: (ok: boolean) => void }
type ControlledWorker = RpcWorker & {
  respond: (request: StatsRequest, ok?: boolean) => Promise<void>
}
const workerState = vi.hoisted(() => ({
  requests: [] as { request: StatsRequest; worker: ControlledWorker }[],
  workers: [] as ControlledWorker[],
  richMounts: vi.fn(),
  sourceMounts: vi.fn(),
}))

vi.mock('@/workers/markdownTextAnalysisWorker?worker', async () => {
  const { createComlinkTestWorker } = await import('@/test/comlinkTestWorker')
  return {
    default: class {
      constructor() {
        const { worker } = createComlinkTestWorker({
          stats: (content: string) =>
            new Promise((resolve, reject) => {
              workerState.requests.push({
                worker: controlled,
                request: {
                  content,
                  complete: (ok) => {
                    if (ok) resolve({ characters: 344, lines: 12, words: 38 })
                    else reject(new Error('Analysis failed'))
                  },
                },
              })
            }),
        })
        const controlled = Object.assign(worker, {
          respond: async (request: StatsRequest, ok = true) => {
            request.complete(ok)
            await new Promise<void>((resolve) => setImmediate(resolve))
          },
        })
        workerState.workers.push(controlled)
        return controlled
      }
    },
  }
})
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key.replace('status.', '') }),
}))
vi.mock('@/pages/hooks/useWorkspaceLinkNavigation', () => ({
  useWorkspaceLinkNavigation: () => ({ openLink: vi.fn(), pending: false }),
}))
vi.mock('@/components/MarkdownEditor', async () => {
  const { useEffect } = await import('react')
  const RichEditor = () => {
    useEffect(() => {
      workerState.richMounts()
    }, [])
    return <div>Rich editor</div>
  }
  return { default: RichEditor }
})
vi.mock('@/components/SourceCodeEditor', async () => {
  const { useEffect } = await import('react')
  const SourceEditor = () => {
    useEffect(() => {
      workerState.sourceMounts()
    }, [])
    return <div>Source editor</div>
  }
  return { default: SourceEditor }
})

const sharedProps = {
  activePath: 'note.md',
  files: [],
  onChange: vi.fn(),
  readOnly: false,
  showStatusBar: true,
  value: 'same unchanged document',
  workspaceKey: 'workspace',
}

const StatsLayout = ({
  source = false,
  cached = true,
  value = sharedProps.value,
}: {
  source?: boolean
  cached?: boolean
  value?: string
}) => {
  const editor = source ? (
    <SourceCodePage {...sharedProps} fileContents={{}} value={value} />
  ) : (
    <WysiwygEditorPage {...sharedProps} onOpenFile={vi.fn()} value={value} />
  )
  return (
    <AppStatusBarProvider activePath="note.md" viewMode={source ? 'source' : 'wysiwyg'}>
      {cached ? (
        <KeepAlive activeCacheKey={source ? 'source' : 'rich'} max={2}>
          {editor}
        </KeepAlive>
      ) : (
        editor
      )}
      <footer aria-label="Status bar">
        <EditorStatusBarSlot label="Document status" />
      </footer>
    </AppStatusBarProvider>
  )
}

const waitForRequest = async (count: number) => {
  await waitFor(() => expect(workerState.requests).toHaveLength(count))
  return workerState.requests[count - 1]!
}
const expectCorrectStats = async () => {
  const footer = within(screen.getByRole('contentinfo', { name: 'Status bar' }))
  await waitFor(() => expect(footer.getByText('12 lines')).toBeInTheDocument())
  expect(footer.getByText('38 words')).toBeInTheDocument()
  expect(footer.getByText('344 characters')).toBeInTheDocument()
}

describe('cached editor document statistics', () => {
  beforeEach(() => {
    workerState.requests.length = 0
    workerState.richMounts.mockClear()
    workerState.sourceMounts.mockClear()
    vi.stubGlobal('Worker', vi.fn())
  })
  afterEach(() => {
    cleanup()
    for (const worker of workerState.workers.splice(0)) {
      worker.onerror?.(new ErrorEvent('error', { message: 'Test cleanup' }))
    }
    vi.unstubAllGlobals()
  })

  it('cancels hidden rich work and recomputes unchanged content through source/rich cache round trips', async () => {
    const view = render(<StatsLayout />)
    const rich = await waitForRequest(1)
    view.rerender(<StatsLayout source />)
    await waitFor(() => expect(rich.worker.terminate).toHaveBeenCalledOnce())
    expect(workerState.requests).toHaveLength(1)
    const source = await waitForRequest(2)
    await act(async () => source.worker.respond(source.request))
    await expectCorrectStats()

    view.rerender(<StatsLayout />)
    const restoredRich = await waitForRequest(3)
    await act(async () => restoredRich.worker.respond(restoredRich.request))
    await expectCorrectStats()
    view.rerender(<StatsLayout source />)
    const restoredSource = await waitForRequest(4)
    await act(async () => restoredSource.worker.respond(restoredSource.request))
    await expectCorrectStats()
    expect(workerState.richMounts).toHaveBeenCalledOnce()
    expect(workerState.sourceMounts).toHaveBeenCalledOnce()
  })

  it('cancels hidden source work and recomputes it when the cached source becomes active', async () => {
    const view = render(<StatsLayout source />)
    const source = await waitForRequest(1)
    view.rerender(<StatsLayout />)
    await waitFor(() => expect(source.worker.terminate).toHaveBeenCalledOnce())
    expect(workerState.requests).toHaveLength(1)
    const rich = await waitForRequest(2)
    await act(async () => rich.worker.respond(rich.request))
    await expectCorrectStats()
    view.rerender(<StatsLayout source />)
    const restoredSource = await waitForRequest(3)
    await act(async () => restoredSource.worker.respond(restoredSource.request))
    await expectCorrectStats()
    expect(workerState.sourceMounts).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    'computes without a cache provider (source=%s) and preserves analysis failure behavior',
    async (source) => {
      const view = render(<StatsLayout source={source} cached={false} />)
      const initial = await waitForRequest(1)
      await act(async () => initial.worker.respond(initial.request))
      await expectCorrectStats()
      view.rerender(<StatsLayout source={source} cached={false} value="Changed document" />)
      const pending = await waitForRequest(2)
      await act(async () => pending.worker.respond(pending.request, false))
      const footer = within(screen.getByRole('contentinfo', { name: 'Status bar' }))
      expect(footer.getByText('0 lines')).toBeInTheDocument()
      expect(footer.getByText('0 words')).toBeInTheDocument()
      expect(footer.getByText('0 characters')).toBeInTheDocument()
    },
  )
})
