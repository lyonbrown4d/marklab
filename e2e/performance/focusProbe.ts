import type { Page } from '@playwright/test'

type FocusProbeWindow = Window & { __marklabFocusEvents?: string[] }

export const startFocusProbe = (page: Page) =>
  page.evaluate(() => {
    const focusEvents: string[] = []
    document.addEventListener('focusin', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      target.dataset.marklabFocusProbe = 'focused'
      focusEvents.push(
        `in:${target.tagName.toLowerCase()}.${target.className}#${target.dataset.index ?? ''}`,
      )
    })
    document.addEventListener('focusout', (event) => {
      const target = event.target
      const nextTarget = event.relatedTarget
      if (!(target instanceof HTMLElement)) return
      const nextLabel =
        nextTarget instanceof HTMLElement
          ? `${nextTarget.tagName.toLowerCase()}.${nextTarget.className}`
          : String(nextTarget)
      focusEvents.push(`out:${target.tagName.toLowerCase()}.${target.className}->${nextLabel}`)
    })
    ;(window as FocusProbeWindow).__marklabFocusEvents = focusEvents
  })

export const captureFocusState = (page: Page, targetIndex: string) =>
  page.evaluate((index) => {
    const activeElement = document.activeElement
    const targetEditor = document.querySelector<HTMLElement>(
      `[data-index="${index}"] .ProseMirror[contenteditable="true"]`,
    )
    const focusEvents = (window as FocusProbeWindow).__marklabFocusEvents
    return {
      activeElementClass:
        activeElement instanceof HTMLElement ? activeElement.className : activeElement?.nodeName,
      activeElementTag: activeElement?.nodeName,
      documentHasFocus: document.hasFocus(),
      focusEvents: focusEvents?.slice(-10) ?? [],
      focusedIndex: activeElement?.closest('[data-index]')?.getAttribute('data-index') ?? null,
      targetEditorConnected: targetEditor?.isConnected ?? false,
      targetEditorFocused: activeElement === targetEditor,
      targetEditorWasFocused: targetEditor?.dataset.marklabFocusProbe === 'focused',
    }
  }, targetIndex)
