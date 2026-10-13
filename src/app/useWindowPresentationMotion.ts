import { useLayoutEffect, useRef, type RefObject } from 'react'
import { onRendererInteractive } from '@/runtime/rendererLifecycle'
import { onWindowPresented } from '@/runtime/window'

// Wait for native presentation as well as readiness; visibility can precede the
// actual OS show. The entrance never delays input or renderer readiness.
const PRESENTATION_DELAY_MS = 160
const PRESENTATION_FALLBACK_MS = 1000
const presentedDocuments = new WeakSet<Document>()

export const useWindowPresentationMotion = (
  applicationRef: RefObject<HTMLElement | null>,
  activated = true,
): void => {
  const interactive = useRef(false)
  const nativePresented = useRef(false)

  useLayoutEffect(() => {
    const application = applicationRef.current
    const ownerDocument = application?.ownerDocument ?? document
    if (presentedDocuments.has(ownerDocument)) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let delayTimer: ReturnType<typeof setTimeout> | undefined
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    let started = false
    let disposed = false
    let subscriptionsReady = false
    let unsubscribeInteractive = () => {}
    let unsubscribePresented = () => {}

    const motionDisabled = () =>
      reducedMotion.matches || ownerDocument.documentElement.dataset.motionPanels === 'false'
    const resetMotion = () => {
      clearTimeout(delayTimer)
      clearTimeout(finishTimer)
      delayTimer = undefined
      finishTimer = undefined
      application?.classList.remove('window-presentation-pending', 'window-presentation-enter')
    }
    const dispose = () => {
      disposed = true
      unsubscribeInteractive()
      unsubscribePresented()
      observer.disconnect()
      ownerDocument.removeEventListener('visibilitychange', handleVisibility)
      reducedMotion.removeEventListener('change', handlePreferences)
      application?.removeEventListener('animationend', handleAnimationEnd)
    }
    const finish = () => {
      presentedDocuments.add(ownerDocument)
      resetMotion()
      dispose()
    }
    const tryStart = () => {
      if (disposed || !activated || !interactive.current || !application || started) {
        return
      }
      if (motionDisabled()) {
        finish()
        return
      }

      // Prepare before the native reveal so the first visible frame already
      // matches the entrance, even when Chromium reports visibility too early.
      application.classList.add('window-presentation-pending')
      if (
        !nativePresented.current ||
        ownerDocument.visibilityState !== 'visible' ||
        delayTimer !== undefined
      )
        return
      delayTimer = setTimeout(() => {
        delayTimer = undefined
        if (ownerDocument.visibilityState !== 'visible') {
          resetMotion()
          tryStart()
          return
        }
        if (motionDisabled()) {
          finish()
          return
        }
        started = true
        presentedDocuments.add(ownerDocument)
        application.classList.replace('window-presentation-pending', 'window-presentation-enter')
        finishTimer = setTimeout(finish, PRESENTATION_FALLBACK_MS)
      }, PRESENTATION_DELAY_MS)
    }
    const handleVisibility = () => {
      if (ownerDocument.visibilityState !== 'visible') {
        if (started) finish()
        else {
          resetMotion()
          tryStart()
        }
        return
      }
      tryStart()
    }
    const handlePreferences = () => {
      if ((started || delayTimer !== undefined) && motionDisabled()) finish()
      else tryStart()
    }
    const handleAnimationEnd = (event: AnimationEvent) => {
      if (event.target === application && event.animationName === 'window-presentation-enter') {
        finish()
      }
    }
    const observer = new MutationObserver(handlePreferences)
    observer.observe(ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ['data-motion-panels'],
    })
    ownerDocument.addEventListener('visibilitychange', handleVisibility)
    reducedMotion.addEventListener('change', handlePreferences)
    application?.addEventListener('animationend', handleAnimationEnd)
    unsubscribeInteractive = onRendererInteractive(() => {
      interactive.current = true
      if (subscriptionsReady) tryStart()
    })
    unsubscribePresented = onWindowPresented(() => {
      nativePresented.current = true
      if (subscriptionsReady) tryStart()
    })
    // A cached presentation can replay synchronously. Start only after both
    // unsubscribe handles are available, including when motion is disabled.
    subscriptionsReady = true
    tryStart()

    return () => {
      resetMotion()
      dispose()
    }
  }, [activated, applicationRef])
}
