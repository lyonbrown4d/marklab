import { expect, type Locator, type Page } from '@playwright/test'

export const PLATE_EDITOR_SELECTOR = '[data-testid="markdown-editor"][data-editor-engine="plate"]'
export const EDITABLE_PLATE_EDITOR_SELECTOR = `${PLATE_EDITOR_SELECTOR}[contenteditable="true"]`

export const captureEditorLocatorState = (editor: Locator) =>
  editor.evaluate((element) => {
    const paragraphStyle = (element: HTMLElement | null) => {
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        marginBottom: style.marginBottom,
        marginTop: style.marginTop,
        paddingBottom: style.paddingBottom,
        paddingTop: style.paddingTop,
      }
    }
    return {
      activeEditors: element.matches('[data-slate-editor="true"]') ? 1 : 0,
      activeParagraphStyle: paragraphStyle(element.querySelector<HTMLElement>('p')),
      chunkCount: element.querySelectorAll('[data-slate-chunk="true"]').length,
      domBreakdown: {
        blockDragWrappers: element.querySelectorAll('[data-block-drag-wrapper="true"]').length,
        codeBlocks: element.querySelectorAll('pre').length,
        links: element.querySelectorAll('a').length,
        mermaidPreviews: element.querySelectorAll('[data-plate-preview="mermaid"]').length,
        mermaidSvgNodes: element.querySelectorAll('[data-plate-mermaid-output] svg *').length,
        slateLeaves: element.querySelectorAll('[data-slate-leaf="true"]').length,
        slateStrings: element.querySelectorAll('[data-slate-string="true"]').length,
        svgNodes: element.querySelectorAll('svg *').length,
        tableCells: element.querySelectorAll('th, td').length,
        tables: element.querySelectorAll('table').length,
      },
      domNodeCount: element.querySelectorAll('*').length + 1,
      renderedElementCount: element.querySelectorAll('[data-slate-node="element"]').length,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      usedJsHeapBytes:
        'memory' in performance
          ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory
              .usedJSHeapSize
          : null,
      viewportHeight: element.clientHeight,
    }
  })

export const captureEditorState = (page: Page) =>
  captureEditorLocatorState(page.locator(PLATE_EDITOR_SELECTOR).first())

export const captureSentinelOrder = (page: Page, sentinels: readonly string[]) =>
  page.evaluate(
    ({ selector, values }) => {
      const text = document.querySelector<HTMLElement>(selector)?.textContent ?? ''
      const positions = values.map((value) => text.indexOf(value))
      return {
        allPresent: positions.every((position) => position >= 0),
        ordered: positions.every(
          (position, index) => index === 0 || position > positions[index - 1],
        ),
        positions,
      }
    },
    { selector: PLATE_EDITOR_SELECTOR, values: [...sentinels] },
  )

export const selectionState = (page: Page) =>
  page.evaluate((selector) => {
    const editor = document.querySelector<HTMLElement>(selector)
    const selection = window.getSelection()
    return {
      insideEditor:
        Boolean(selection?.anchorNode && editor?.contains(selection.anchorNode)) &&
        Boolean(selection?.focusNode && editor?.contains(selection.focusNode)),
      textLength: selection?.toString().length ?? 0,
    }
  }, EDITABLE_PLATE_EDITOR_SELECTOR)

export const dragNativeScrollbar = async (page: Page, viewport: Locator) => {
  const box = await viewport.boundingBox()
  if (!box) throw new Error('Editor viewport has no bounding box')
  const scroll = await viewport.evaluate((element) => {
    const viewportElement = element as HTMLElement
    const style = getComputedStyle(viewportElement)
    return {
      borderLeftWidth: Number.parseFloat(style.borderLeftWidth) || 0,
      borderRightWidth: Number.parseFloat(style.borderRightWidth) || 0,
      borderTopWidth: Number.parseFloat(style.borderTopWidth) || 0,
      clientHeight: viewportElement.clientHeight,
      clientWidth: viewportElement.clientWidth,
      offsetWidth: viewportElement.offsetWidth,
      scrollHeight: viewportElement.scrollHeight,
      scrollTop: viewportElement.scrollTop,
    }
  })
  const scrollbarWidth =
    scroll.offsetWidth - scroll.clientWidth - scroll.borderLeftWidth - scroll.borderRightWidth
  if (scrollbarWidth < 2) {
    return {
      gutterWidth: scrollbarWidth,
      moved: false,
      reason: 'The platform exposes an overlay scrollbar with no measurable native gutter.',
      supported: false,
    }
  }
  const maxScrollTop = scroll.scrollHeight - scroll.clientHeight
  if (maxScrollTop <= 0) {
    return {
      gutterWidth: scrollbarWidth,
      moved: false,
      reason: 'The editor viewport has no scrollable range.',
      supported: false,
    }
  }
  await expect
    .poll(
      () =>
        viewport.evaluate((element) => {
          const viewportElement = element as HTMLElement
          const target = (viewportElement.scrollHeight - viewportElement.clientHeight) / 2
          viewportElement.scrollTo({ behavior: 'instant', top: target })
          return Math.abs(viewportElement.scrollTop - target) <= 2
        }),
      { message: 'The editor viewport did not settle at the native scrollbar midpoint.' },
    )
    .toBe(true)
  const startScrollTop = await viewport.evaluate((element) => element.scrollTop)
  const startY = box.y + scroll.borderTopWidth + scroll.clientHeight / 2
  const endY = box.y + scroll.borderTopWidth + scroll.clientHeight * 0.75
  const scrollbarCenterX = box.x + scroll.borderLeftWidth + scroll.clientWidth + scrollbarWidth / 2
  await page.mouse.move(scrollbarCenterX, startY)
  await page.mouse.down()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  for (let step = 1; step <= 40; step += 1) {
    await page.mouse.move(scrollbarCenterX, startY + ((endY - startY) * step) / 40)
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
  }
  await page.mouse.up()
  const afterScrollTop = await viewport.evaluate((element) => element.scrollTop)
  return {
    afterScrollTop,
    dragEndY: endY,
    dragStartX: scrollbarCenterX,
    dragStartY: startY,
    gutterWidth: scrollbarWidth,
    moved: afterScrollTop > startScrollTop,
    reason:
      afterScrollTop > startScrollTop
        ? null
        : 'Dragging the measured native scrollbar gutter did not move the viewport.',
    startScrollRatio: startScrollTop / maxScrollTop,
    startScrollTop,
    supported: true,
  }
}

export const exerciseWheel = async (page: Page, viewport: Locator) => {
  const box = await viewport.boundingBox()
  if (!box) throw new Error('Editor viewport has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < 36; index += 1) {
    await page.mouse.wheel(0, 620)
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
  }
}
