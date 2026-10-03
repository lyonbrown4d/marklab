import { useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { useNativeSurfaceInsetsStore } from '@/app/nativeSurfaceInsets'

const TOASTER_SELECTOR = '[data-sonner-toaster]'
const TOAST_SELECTOR = '[data-sonner-toast]'

const getVisibleToasts = (toaster: HTMLElement | null) =>
  Array.from(toaster?.querySelectorAll<HTMLElement>(TOAST_SELECTOR) ?? []).filter((toast) => {
    const rect = toast.getBoundingClientRect()
    const style = window.getComputedStyle(toast)
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    )
  })

const measureToastInset = (toasts: HTMLElement[]) => {
  if (toasts.length === 0) return 0
  const top = Math.min(...toasts.map((toast) => toast.getBoundingClientRect().top))
  return Math.max(0, Math.ceil(window.innerHeight - Math.max(0, top)))
}

const nodeContainsToaster = (node: Node) =>
  node instanceof Element &&
  (node.matches(TOASTER_SELECTOR) || node.querySelector(TOASTER_SELECTOR) !== null)

const mutationsContainToaster = (records: MutationRecord[]) =>
  records.some((record) => [...record.addedNodes, ...record.removedNodes].some(nodeContainsToaster))

const AppToaster = () => {
  const setToastHeight = useNativeSurfaceInsetsStore((state) => state.setToastHeight)
  useEffect(() => {
    let toaster: HTMLElement | null = null
    let observedToasts = new Set<HTMLElement>()
    let lastInset = -1
    const commitInset = () => {
      const nextInset = measureToastInset(getVisibleToasts(toaster))
      if (nextInset === lastInset) return
      lastInset = nextInset
      setToastHeight(nextInset)
    }
    const resizeObserver = new ResizeObserver(commitInset)
    const reconcileToasts = () => {
      const nextToasts = new Set(toaster?.querySelectorAll<HTMLElement>(TOAST_SELECTOR) ?? [])
      observedToasts.forEach((toast) => {
        if (!nextToasts.has(toast)) resizeObserver.unobserve(toast)
      })
      nextToasts.forEach((toast) => {
        if (!observedToasts.has(toast)) resizeObserver.observe(toast)
      })
      observedToasts = nextToasts
      commitInset()
    }
    const toasterObserver = new MutationObserver(() => {
      if (toaster?.isConnected && toaster.matches(TOASTER_SELECTOR)) reconcileToasts()
      else bindToaster()
    })
    const bindToaster = () => {
      const nextToaster = document.querySelector<HTMLElement>(TOASTER_SELECTOR)
      if (nextToaster === toaster) {
        reconcileToasts()
        return
      }
      toasterObserver.disconnect()
      toaster = nextToaster
      if (toaster) {
        toasterObserver.observe(toaster, { attributes: true, childList: true, subtree: true })
      }
      reconcileToasts()
    }
    const bodyObserver = new MutationObserver((records) => {
      if (mutationsContainToaster(records)) bindToaster()
    })
    bodyObserver.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', commitInset)
    document.addEventListener('transitionend', commitInset, true)
    document.addEventListener('animationend', commitInset, true)
    bindToaster()
    return () => {
      bodyObserver.disconnect()
      toasterObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', commitInset)
      document.removeEventListener('transitionend', commitInset, true)
      document.removeEventListener('animationend', commitInset, true)
      setToastHeight(0)
    }
  }, [setToastHeight])
  return <Toaster richColors closeButton position="bottom-center" />
}

export default AppToaster
