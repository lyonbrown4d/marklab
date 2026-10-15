import { beforeEach, describe, expect, it, vi } from 'vitest'

const workers = vi.hoisted(() => ({
  editor: vi.fn(),
  css: vi.fn(),
  html: vi.fn(),
  json: vi.fn(),
  typescript: vi.fn(),
  loaded: vi.fn(),
}))

vi.mock('monaco-editor/editor/editor.worker.js?worker', () => {
  workers.loaded('editor')
  return { default: workers.editor }
})
vi.mock('monaco-editor/languages/features/css/css.worker.js?worker', () => {
  workers.loaded('css')
  return { default: workers.css }
})
vi.mock('monaco-editor/languages/features/html/html.worker.js?worker', () => {
  workers.loaded('html')
  return { default: workers.html }
})
vi.mock('monaco-editor/languages/features/json/json.worker.js?worker', () => {
  workers.loaded('json')
  return { default: workers.json }
})
vi.mock('monaco-editor/languages/features/typescript/ts.worker.js?worker', () => {
  workers.loaded('typescript')
  return { default: workers.typescript }
})

describe('Monaco worker loading', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('loads no worker constructor modules until Monaco asks for one', async () => {
    const { loadMonacoWorker } = await import('@/lib/monacoWorkers')
    expect(workers.loaded).not.toHaveBeenCalled()
    await loadMonacoWorker('', 'json')
    expect(workers.loaded).toHaveBeenCalledExactlyOnceWith('json')
    expect(workers.json).toHaveBeenCalledOnce()
    expect(workers.editor).not.toHaveBeenCalled()
  })

  it.each([
    ['editorWorkerService', 'editor'],
    ['unknown', 'editor'],
    ['json', 'json'],
    ['css', 'css'],
    ['scss', 'css'],
    ['less', 'css'],
    ['html', 'html'],
    ['handlebars', 'html'],
    ['razor', 'html'],
    ['typescript', 'typescript'],
    ['javascript', 'typescript'],
  ] as const)('routes %s to its %s worker', async (label, family) => {
    const { loadMonacoWorker } = await import('@/lib/monacoWorkers')
    await loadMonacoWorker('', label)
    expect(workers[family]).toHaveBeenCalledOnce()
  })

  it('creates distinct worker instances for each request and retries construction failures', async () => {
    const { loadMonacoWorker } = await import('@/lib/monacoWorkers')
    workers.css.mockImplementationOnce(function () {
      throw new Error('Worker unavailable')
    })
    await expect(loadMonacoWorker('', 'css')).rejects.toThrow('Worker unavailable')
    const first = await loadMonacoWorker('', 'scss')
    const second = await loadMonacoWorker('', 'less')
    expect(first).not.toBe(second)
    expect(workers.css).toHaveBeenCalledTimes(3)
  })
})
