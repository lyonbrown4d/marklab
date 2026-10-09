import { useEffect } from 'react'
import { isImeKeyboardEvent } from '@/logic/ime'

const ZONE_SELECTOR = '[data-app-focus-zone]'
const ZONE_ORDER = ['titlebar', 'sidebar', 'editor', 'inspector', 'terminal', 'statusbar']
const FOCUSABLE_SELECTOR = [
  '[data-focus-entry]',
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const isAvailable = (element: HTMLElement) => {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  let current: HTMLElement | null = element
  while (current) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    current = current.parentElement
  }
  return true
}

const focusZone = (zone: HTMLElement) => {
  const entry = Array.from(zone.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).find(isAvailable)
  if (entry) {
    entry.focus({ preventScroll: true })
    return
  }
  if (!zone.hasAttribute('tabindex')) zone.tabIndex = -1
  zone.focus({ preventScroll: true })
}

const orderZonesSpatially = (zones: HTMLElement[]) =>
  zones.sort((left, right) => {
    const leftIndex = ZONE_ORDER.indexOf(left.dataset.appFocusZone ?? '')
    const rightIndex = ZONE_ORDER.indexOf(right.dataset.appFocusZone ?? '')
    return (
      (leftIndex < 0 ? ZONE_ORDER.length : leftIndex) -
      (rightIndex < 0 ? ZONE_ORDER.length : rightIndex)
    )
  })

export const ApplicationFocusCycle = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== 'F6' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isImeKeyboardEvent(event)
      ) {
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('[role="dialog"], [aria-modal="true"]')) return
      const zones = orderZonesSpatially(
        Array.from(document.querySelectorAll<HTMLElement>(ZONE_SELECTOR)).filter(isAvailable),
      )
      if (zones.length === 0) return
      const activeZone =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.closest<HTMLElement>(ZONE_SELECTOR)
          : null
      const activeIndex = activeZone ? zones.indexOf(activeZone) : -1
      const direction = event.shiftKey ? -1 : 1
      const fallbackIndex = event.shiftKey ? 0 : -1
      const nextIndex =
        (Math.max(activeIndex, fallbackIndex) + direction + zones.length) % zones.length
      event.preventDefault()
      event.stopPropagation()
      focusZone(zones[nextIndex])
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  return null
}
