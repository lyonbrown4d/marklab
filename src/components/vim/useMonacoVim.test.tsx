import { act, render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMonacoVim } from '@/components/vim/useMonacoVim'

const runtime = vi.hoisted(() => ({ load: vi.fn(), attach: vi.fn(), detach: vi.fn() }))
vi.mock('@/components/vim/monacoVimRuntime', () => ({
  loadMonacoVim: runtime.load,
  attachMonacoVim: runtime.attach,
}))

const makeEditor = () => {
  const model = {}
  let changeModel = () => {}
  let disposeEditor = () => {}
  return {
    getModel: vi.fn(() => model),
    onDidChangeModel: vi.fn((listener: () => void) => {
      changeModel = listener
      return { dispose: vi.fn() }
    }),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeEditor = listener
      return { dispose: vi.fn() }
    }),
    switchModel: () => changeModel(),
    disposeEditor: () => disposeEditor(),
  }
}

type HarnessProps = {
  editor: ReturnType<typeof makeEditor>
  enabled?: boolean
  interactive?: boolean
  readOnly?: boolean
  path?: string
}
const Harness = ({
  editor,
  enabled = true,
  interactive = true,
  readOnly = false,
  path = 'a.md',
}: HarnessProps) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const error = useMonacoVim({
    editor: editor as unknown as MonacoEditor.IStandaloneCodeEditor,
    enabled: enabled && !readOnly,
    interactive,
    modelKey: path,
    rootRef,
    statusRef,
    acceptsChanges: () => interactive,
    createCommands: () => ({ write: vi.fn(), quit: vi.fn() }),
  })
  return (
    <div ref={rootRef} data-testid="region">
      <div ref={statusRef} />
      {error}
    </div>
  )
}

let frames: FrameRequestCallback[]
const tick = async () => {
  await act(async () => {
    frames.splice(0).forEach((callback) => callback(0))
  })
}

beforeEach(() => {
  frames = []
  vi.clearAllMocks()
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    }),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  runtime.load.mockResolvedValue({})
  runtime.attach.mockImplementation(({ onMode }: { onMode: (mode: string) => void }) => {
    onMode('NORMAL')
    return runtime.detach
  })
})

describe('Monaco Vim lifecycle', () => {
  it('loads only while enabled and interactive and registers the editor/status region', async () => {
    const editor = makeEditor()
    const view = render(<Harness editor={editor} enabled={false} />)
    await tick()
    expect(runtime.load).not.toHaveBeenCalled()
    expect(view.getByTestId('region')).not.toHaveAttribute('data-vim-active')
    view.rerender(<Harness editor={editor} />)
    await tick()
    expect(runtime.attach).toHaveBeenCalledOnce()
    expect(view.getByTestId('region')).toHaveAttribute('data-vim-active', 'true')
    expect(view.getByTestId('region')).toHaveAttribute('data-vim-mode', 'NORMAL')
    view.rerender(<Harness editor={editor} readOnly />)
    expect(runtime.detach).toHaveBeenCalledOnce()
    expect(view.getByTestId('region')).not.toHaveAttribute('data-vim-active')
    view.rerender(<Harness editor={editor} interactive={false} />)
    await tick()
    expect(runtime.attach).toHaveBeenCalledOnce()
  })

  it('discards a late plugin load after switching models or toggling off', async () => {
    let resolve: (value: object) => void = () => {}
    runtime.load.mockReturnValue(
      new Promise((complete) => {
        resolve = complete
      }),
    )
    const editor = makeEditor()
    const view = render(<Harness editor={editor} />)
    await tick()
    view.rerender(<Harness editor={editor} enabled={false} />)
    await act(async () => {
      resolve({})
    })
    expect(runtime.attach).not.toHaveBeenCalled()
    expect(view.getByTestId('region')).not.toHaveAttribute('data-vim-active')
  })

  it('resets on model changes and invalidates old asynchronous command handlers', async () => {
    const editor = makeEditor()
    const view = render(<Harness editor={editor} />)
    await tick()
    const oldSession = runtime.attach.mock.calls[0][0] as { isCurrent: () => boolean }
    expect(oldSession.isCurrent()).toBe(true)
    act(() => editor.switchModel())
    expect(runtime.detach).toHaveBeenCalledOnce()
    expect(oldSession.isCurrent()).toBe(false)
    await tick()
    expect(runtime.attach).toHaveBeenCalledTimes(2)
    const currentSession = runtime.attach.mock.calls[1][0] as { isCurrent: () => boolean }
    act(() => editor.disposeEditor())
    expect(currentSession.isCurrent()).toBe(false)
    expect(view.getByTestId('region')).not.toHaveAttribute('data-vim-active')
    view.unmount()
    expect(runtime.detach).toHaveBeenCalledTimes(2)
  })

  it('leaves normal editing available and reports plugin load failures', async () => {
    runtime.load.mockRejectedValue(new Error('Vim failed to load'))
    const editor = makeEditor()
    const view = render(<Harness editor={editor} />)
    await tick()
    await waitFor(() => expect(view.getByText('Vim failed to load')).toBeInTheDocument())
    expect(runtime.attach).not.toHaveBeenCalled()
    expect(view.getByTestId('region')).not.toHaveAttribute('data-vim-active')
  })
})
