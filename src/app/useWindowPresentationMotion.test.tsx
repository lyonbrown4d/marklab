import { StrictMode, useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const interactiveListeners = vi.hoisted(() => new Set<() => void>())
vi.mock('@/runtime/rendererLifecycle', () => ({
  onRendererInteractive: (listener: () => void) => {
    interactiveListeners.add(listener)
    return () => interactiveListeners.delete(listener)
  },
}))

const nativePresentation = vi.hoisted(() => ({
  delivered: false,
  listeners: new Set<() => void>(),
}))
vi.mock('@/runtime/window', () => ({
  onWindowPresented: (listener: () => void) => {
    nativePresentation.listeners.add(listener)
    if (nativePresentation.delivered) listener()
    return () => nativePresentation.listeners.delete(listener)
  },
}))
const notifyPresented = () =>
  act(() => {
    nativePresentation.delivered = true
    nativePresentation.listeners.forEach((listener) => listener())
  })
const notifyReadyToPresent = () => {
  notifyInteractive()
  notifyPresented()
}

let usePresentation: typeof import('@/app/useWindowPresentationMotion').useWindowPresentationMotion
let reducedMotion: boolean
let mediaEvents: EventTarget
const notifyInteractive = () => act(() => interactiveListeners.forEach((listener) => listener()))
const advance = (time: number) => act(() => vi.advanceTimersByTime(time))
const Application = ({ activated = true, click = () => {} }) => {
  const applicationRef = useRef<HTMLDivElement>(null)
  usePresentation(applicationRef, activated)
  return activated ? (
    <div data-testid="application" ref={applicationRef}>
      <input aria-label="Editor" />
      <button onClick={click} type="button">
        Action
      </button>
    </div>
  ) : null
}
const application = () => screen.getByTestId('application')
const endAnimation = (target = application(), animationName = 'window-presentation-enter') => {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  fireEvent(target, event)
}

describe('first window presentation motion', () => {
  beforeEach(async () => {
    vi.resetModules()
    usePresentation = (await import('@/app/useWindowPresentationMotion'))
      .useWindowPresentationMotion
    interactiveListeners.clear()
    nativePresentation.delivered = false
    nativePresentation.listeners.clear()
    vi.useFakeTimers()
    reducedMotion = false
    mediaEvents = new EventTarget()
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      get matches() {
        return reducedMotion
      },
      addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
      removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
    } as MediaQueryList)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    delete document.documentElement.dataset.motionPanels
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    delete document.documentElement.dataset.motionPanels
  })

  it('prepares early but does not animate before native presentation', () => {
    render(<Application />)
    expect(application()).not.toHaveClass('window-presentation-pending')
    notifyInteractive()
    advance(1000)
    expect(application()).toHaveClass('window-presentation-pending')
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
    notifyPresented()
    expect(application()).toHaveClass('window-presentation-pending')
    advance(159)
    expect(application()).not.toHaveClass('window-presentation-enter')
    advance(1)
    expect(application()).toHaveClass('window-presentation-enter')
    expect(application()).not.toHaveClass('window-presentation-pending')
    advance(350)
    expect(application()).toHaveClass('window-presentation-enter')
    endAnimation()
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
    expect(interactiveListeners.size).toBe(0)
    expect(nativePresentation.listeners.size).toBe(0)
  })

  it('replays an earlier native presentation but still waits for renderer readiness', () => {
    notifyPresented()
    render(<Application />)
    advance(1000)
    expect(application()).not.toHaveClass('window-presentation-pending')
    notifyInteractive()
    advance(160)
    expect(application()).toHaveClass('window-presentation-enter')
  })

  it('starts only after a hidden native renderer becomes visible', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<Application />)
    notifyReadyToPresent()
    advance(1000)
    expect(application()).toHaveClass('window-presentation-pending')
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(application()).toHaveClass('window-presentation-pending')
    advance(160)
    expect(application()).toHaveClass('window-presentation-enter')
  })

  it('waits again if visibility is lost during the presentation delay', () => {
    render(<Application />)
    notifyReadyToPresent()
    advance(80)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
    advance(1000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    advance(159)
    expect(application()).toHaveClass('window-presentation-pending')
    advance(1)
    expect(application()).toHaveClass('window-presentation-enter')
  })

  it('keeps input and focus usable throughout the delay and animation', () => {
    const click = vi.fn()
    render(<Application click={click} />)
    notifyReadyToPresent()
    const editor = screen.getByRole('textbox')
    editor.focus()
    fireEvent.change(editor, { target: { value: 'Immediate input' } })
    fireEvent.click(screen.getByRole('button'))
    advance(160)
    fireEvent.click(screen.getByRole('button'))
    expect(editor).toHaveValue('Immediate input')
    expect(editor).toHaveFocus()
    expect(click).toHaveBeenCalledTimes(2)
    expect(application()).not.toHaveAttribute('inert')
    expect(application()).not.toHaveAttribute('aria-hidden')
  })

  it.each(['system', 'panels'])(
    'skips both delay and animation for %s motion preferences',
    (mode) => {
      if (mode === 'system') reducedMotion = true
      else document.documentElement.dataset.motionPanels = 'false'
      render(<Application />)
      notifyReadyToPresent()
      expect(application()).not.toHaveClass('window-presentation-pending')
      expect(application()).not.toHaveClass('window-presentation-enter')
      expect(vi.getTimerCount()).toBe(0)
      expect(interactiveListeners.size).toBe(0)
      expect(nativePresentation.listeners.size).toBe(0)
    },
  )

  it('remembers an interactive notification received before standby activation', () => {
    const view = render(<Application activated={false} />)
    notifyReadyToPresent()
    expect(screen.queryByTestId('application')).not.toBeInTheDocument()
    view.rerender(<Application />)
    expect(application()).toHaveClass('window-presentation-pending')
    advance(160)
    expect(application()).toHaveClass('window-presentation-enter')
  })

  it('does not replay on later readiness, visibility, focus or component remounts', () => {
    const view = render(<Application />)
    notifyReadyToPresent()
    advance(160)
    endAnimation()
    notifyReadyToPresent()
    fireEvent(document, new Event('visibilitychange'))
    fireEvent.focus(window)
    view.unmount()
    render(<Application />)
    notifyReadyToPresent()
    expect(application()).not.toHaveClass('window-presentation-pending')
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('subscribes once under StrictMode and cleans up an unfinished delay on unmount', () => {
    const view = render(
      <StrictMode>
        <Application />
      </StrictMode>,
    )
    expect(interactiveListeners.size).toBe(1)
    expect(nativePresentation.listeners.size).toBe(1)
    notifyReadyToPresent()
    const element = application()
    view.unmount()
    expect(interactiveListeners.size).toBe(0)
    expect(nativePresentation.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(element).not.toHaveClass('window-presentation-pending')
  })

  it('cleans up when animationend is absent and ignores child or unrelated animation events', () => {
    render(<Application />)
    notifyReadyToPresent()
    advance(160)
    endAnimation(screen.getByRole('button'))
    endAnimation(application(), 'panel-enter')
    expect(application()).toHaveClass('window-presentation-enter')
    advance(999)
    expect(application()).toHaveClass('window-presentation-enter')
    advance(1)
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
    expect(interactiveListeners.size).toBe(0)
    expect(nativePresentation.listeners.size).toBe(0)
  })

  it.each(['prepared', 'delayed'])('cancels %s motion when system preferences change', (stage) => {
    render(<Application />)
    if (stage === 'prepared') notifyInteractive()
    else notifyReadyToPresent()
    reducedMotion = true
    act(() => mediaEvents.dispatchEvent(new Event('change')))
    expect(application()).not.toHaveClass('window-presentation-pending')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a running entrance when panel motion is disabled', async () => {
    render(<Application />)
    notifyReadyToPresent()
    advance(160)
    await act(async () => {
      document.documentElement.dataset.motionPanels = 'false'
    })
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ends a running entrance when hidden and does not replay it on return', () => {
    render(<Application />)
    notifyReadyToPresent()
    advance(160)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(application()).not.toHaveClass('window-presentation-enter')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    expect(application()).not.toHaveClass('window-presentation-pending')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('checks visibility and preferences again when the delay timer fires', () => {
    render(<Application />)
    notifyReadyToPresent()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    advance(160)
    expect(application()).toHaveClass('window-presentation-pending')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    reducedMotion = true
    advance(160)
    expect(application()).not.toHaveClass('window-presentation-enter')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up synchronous native replay when reduced motion follows standby activation', () => {
    const view = render(<Application activated={false} />)
    notifyReadyToPresent()
    reducedMotion = true
    view.rerender(<Application />)
    expect(application()).not.toHaveClass('window-presentation-pending')
    expect(vi.getTimerCount()).toBe(0)
    expect(interactiveListeners.size).toBe(0)
    expect(nativePresentation.listeners.size).toBe(0)
  })
})
