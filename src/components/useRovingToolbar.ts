import { useCallback, useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react'

const ITEM_SELECTOR = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"])'

const getItems = (toolbar: HTMLElement) =>
  Array.from(toolbar.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(
    (item) => !item.closest('[hidden], [inert], [aria-hidden="true"]'),
  )

const selectItem = (items: HTMLElement[], index: number, focus: boolean) => {
  items.forEach((item, itemIndex) => {
    item.tabIndex = itemIndex === index ? 0 : -1
  })
  if (focus) items[index]?.focus({ preventScroll: true })
}

export const useRovingToolbar = (itemRevision: unknown) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const toolbar = ref.current
    if (!toolbar) return
    const items = getItems(toolbar)
    const activeIndex = items.findIndex((item) => item === document.activeElement)
    selectItem(items, activeIndex < 0 ? 0 : activeIndex, false)
  }, [itemRevision])

  const onFocusCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const items = getItems(event.currentTarget)
    const index = items.indexOf(event.target as HTMLElement)
    if (index < 0) return
    items.forEach((item, itemIndex) => {
      item.tabIndex = itemIndex === index ? 0 : -1
    })
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    const items = getItems(event.currentTarget)
    if (items.length === 0) return
    const current = items.indexOf(event.target as HTMLElement)
    if (current < 0) return
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    event.preventDefault()
    event.stopPropagation()
    selectItem(items, next, true)
  }, [])

  return { onFocusCapture, onKeyDown, ref }
}
