import type { CodeBlockConfig } from '@milkdown/kit/component/code-block'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureMermaidPreview,
  refreshMermaidPreviews,
} from '@/components/milkdown/mermaidPreview'

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => ({ default: mermaid }))
vi.mock('@/i18n/setup', () => ({
  default: { t: (key: string) => (key === 'preview.mermaidLoading' ? 'Loading diagram...' : key) },
}))

const frames: FrameRequestCallback[] = []
const observers: PreviewObserver[] = []
class PreviewObserver {
  private readonly notify: IntersectionObserverCallback
  target: Element | null = null
  disconnect = vi.fn()
  observe = vi.fn((target: Element) => {
    this.target = target
  })
  unobserve = vi.fn()
  constructor(notify: IntersectionObserverCallback) {
    this.notify = notify
    observers.push(this)
  }
  intersect = () =>
    this.notify(
      [{ target: this.target, isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
}

const renderPreview = configureMermaidPreview({
  languages: [],
  renderPreview: vi.fn(),
} as unknown as CodeBlockConfig).renderPreview

const createHost = () => {
  const host = document.createElement('div')
  document.body.append(host)
  const apply = vi.fn((value: null | string | HTMLElement) => {
    // Mirror Milkdown: it sanitizes/copies HTML rather than inserting this element.
    host.innerHTML = typeof value === 'string' ? value : (value?.outerHTML ?? '')
  })
  return { host, apply }
}

const flushFrame = () => frames.splice(0).forEach((callback) => callback(0))
const settle = async () => {
  await vi.dynamicImportSettled()
}

beforeEach(() => {
  frames.length = 0
  observers.length = 0
  mermaid.initialize.mockReset()
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg><text>Diagram</text></svg>' })
  document.documentElement.dataset.theme = 'paper'
  vi.stubGlobal('IntersectionObserver', PreviewObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
})

afterEach(() => {
  document.body.replaceChildren()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Mermaid preview lifecycle', () => {
  it('uses the localized loading placeholder and observes its mounted copy', () => {
    const { host, apply } = createHost()
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    const placeholder = apply.mock.calls[0]?.[0]
    expect(placeholder).toBeInstanceOf(HTMLDivElement)
    expect(placeholder).toHaveTextContent('Loading diagram...')
    expect(host).toHaveTextContent('Loading diagram...')
    expect(observers).toHaveLength(0)
    flushFrame()
    expect(observers).toHaveLength(1)
    expect(observers[0].target).toBe(host.firstElementChild)
    expect(observers[0].target).not.toBe(placeholder)
  })

  it('renders multiple diagrams independently even when they finish out of order', async () => {
    const first = createHost()
    const second = createHost()
    let finishFirst!: (value: { svg: string }) => void
    mermaid.render
      .mockImplementationOnce(
        () =>
          new Promise<{ svg: string }>((resolve) => {
            finishFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ svg: '<svg><text>Second</text></svg>' })
    renderPreview('mermaid', 'graph TD\n A --> B', first.apply)
    renderPreview('mermaid', 'graph TD\n C --> D', second.apply)
    flushFrame()
    observers.forEach((observer) => observer.intersect())
    await settle()
    expect(second.host.querySelector('svg')).toHaveTextContent('Second')
    finishFirst({ svg: '<svg><text>First</text></svg>' })
    await settle()
    expect(first.host.querySelector('svg')).toHaveTextContent('First')
    expect(second.host.querySelector('svg')).toHaveTextContent('Second')
  })

  it('ignores a result after that block has been edited or removed', async () => {
    const { host, apply } = createHost()
    let finish!: (value: { svg: string }) => void
    mermaid.render.mockImplementationOnce(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          finish = resolve
        }),
    )
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    flushFrame()
    observers[0].intersect()
    await settle()
    host.replaceChildren()
    finish({ svg: '<svg><text>Outdated</text></svg>' })
    await settle()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(host).toBeEmptyDOMElement()
  })

  it('does not observe a preview removed before it mounts', () => {
    const { host, apply } = createHost()
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    host.remove()
    flushFrame()
    expect(observers).toHaveLength(0)
  })

  it('disconnects an observer whose preview is removed before becoming visible', () => {
    const { host, apply } = createHost()
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    flushFrame()
    host.remove()
    observers[0].intersect()
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(mermaid.render).not.toHaveBeenCalled()
  })

  it.each([
    ['ink', 'dark'],
    ['graphite', 'dark'],
    ['nord', 'dark'],
    ['obsidian', 'dark'],
    ['paper', 'default'],
    ['ivory', 'default'],
    ['sepia', 'default'],
    ['github', 'default'],
    ['solarized', 'default'],
    ['mist', 'default'],
  ])(
    'uses the explicit %s app theme rather than the operating system theme',
    async (theme, expected) => {
      document.documentElement.dataset.theme = theme
      vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: expected === 'default',
      } as MediaQueryList)
      const { apply } = createHost()
      renderPreview('mermaid', 'graph TD\n A --> B', apply)
      flushFrame()
      observers[0].intersect()
      await settle()
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: expected,
          securityLevel: 'strict',
        }),
      )
    },
  )

  it('shows escaped error text instead of leaving a failed diagram loading', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('<img src=x onerror=alert(1)>'))
    const { host, apply } = createHost()
    renderPreview('mermaid', 'invalid', apply)
    flushFrame()
    observers[0].intersect()
    await settle()
    expect(host.querySelector('pre')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(host.querySelector('img')).toBeNull()
  })

  it('refreshes mounted diagrams on consecutive theme changes without replacing the host', async () => {
    const { host, apply } = createHost()
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    flushFrame()
    observers[0].intersect()
    await settle()
    flushFrame()
    for (const [theme, expected] of [
      ['ink', 'dark'],
      ['paper', 'default'],
    ]) {
      document.documentElement.dataset.theme = theme
      refreshMermaidPreviews(host)
      await settle()
      flushFrame()
      expect(mermaid.initialize).toHaveBeenLastCalledWith(
        expect.objectContaining({ theme: expected }),
      )
      expect(host.querySelector('svg')).toHaveTextContent('Diagram')
    }
    expect(mermaid.render).toHaveBeenCalledTimes(3)
    host.replaceChildren()
    refreshMermaidPreviews(host)
    expect(mermaid.render).toHaveBeenCalledTimes(3)
  })

  it('does not eagerly render an offscreen diagram when the theme changes', async () => {
    const { host, apply } = createHost()
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    flushFrame()
    document.documentElement.dataset.theme = 'ink'
    refreshMermaidPreviews(host)
    expect(mermaid.render).not.toHaveBeenCalled()
    observers[0].intersect()
    await settle()
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }))
  })

  it('ignores an older theme render that completes after the current one', async () => {
    const { host, apply } = createHost()
    let finish!: (value: { svg: string }) => void
    mermaid.render.mockImplementationOnce(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          finish = resolve
        }),
    )
    renderPreview('mermaid', 'graph TD\n A --> B', apply)
    flushFrame()
    observers[0].intersect()
    await settle()
    document.documentElement.dataset.theme = 'ink'
    refreshMermaidPreviews(host)
    await settle()
    finish({ svg: '<svg><text>Old light diagram</text></svg>' })
    await settle()
    expect(host.querySelector('svg')).toHaveTextContent('Diagram')
    expect(host).not.toHaveTextContent('Old light diagram')
  })
})
