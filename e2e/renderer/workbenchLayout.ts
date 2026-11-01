import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs/promises'
// eslint-disable-next-line no-restricted-imports -- Type-only test fixture reference.
import type { RendererSession } from './rendererHarness.js'

export const captureWorkbenchLayout = async (page: Page, info: TestInfo) => {
  const layout = await page.evaluate(() => {
    const inspect = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        tag: element.tagName,
        class: element.className,
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        inlineStyle: element.getAttribute('style'),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right },
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        styles: Object.fromEntries(
          [
            'display',
            'position',
            'width',
            'height',
            'min-width',
            'max-width',
            'flex',
            'flex-direction',
            'overflow',
            'overflow-x',
            'transform',
          ].map((key) => [key, style.getPropertyValue(key)]),
        ),
      }
    }
    const ancestors = (selector: string) => {
      const output = []
      let element =
        [...document.querySelectorAll(selector)].find((candidate) => {
          const box = candidate.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        }) ?? null
      while (element) {
        output.push(inspect(element))
        element = element.parentElement
      }
      return output
    }
    return {
      graph: ancestors('[data-testid="knowledge-graph"]'),
      editor: ancestors('[data-testid="markdown-editor"]'),
      source: ancestors('.monaco-editor'),
      dock: [
        ...document.querySelectorAll(
          '.dv-groupview, .dv-content-container, .dv-render-overlay, .dv-react-part, [data-workbench-pane]',
        ),
      ].map(inspect),
    }
  })
  const path = info.outputPath('workbench-layout.json')
  await fs.writeFile(path, JSON.stringify(layout, null, 2))
  await info.attach('workbench-layout.json', { path, contentType: 'application/json' })
}

// SDK portals live outside group DOM; compare real rectangles, not DOM ancestry.
export const expectDockContentFits = async (page: Page) => {
  await expect
    .poll(
      async () =>
        page.locator('[data-workbench-pane]:visible').evaluateAll((panes) => {
          const groups = [...document.querySelectorAll('.dv-groupview')].map((element) =>
            element.getBoundingClientRect(),
          )
          const within = (box: DOMRect, group: DOMRect) =>
            box.left >= group.left - 2 &&
            box.right <= group.right + 2 &&
            box.top >= group.top - 2 &&
            box.bottom <= group.bottom + 2
          return panes.flatMap((pane) => {
            const box = pane.getBoundingClientRect()
            const group = groups.find((candidate) => within(box, candidate))
            if (!group)
              return [
                `pane ${pane.getAttribute('data-workbench-pane')} exceeds its group (${box.x}, ${box.width})`,
              ]
            const errors =
              pane.scrollWidth > pane.clientWidth + 2 ? ['pane has horizontal overflow'] : []
            for (const child of pane.querySelectorAll(
              '[data-testid="markdown-editor"], [data-testid="knowledge-graph"], .monaco-editor',
            )) {
              const content = child.getBoundingClientRect()
              if (!within(content, group)) errors.push(`${child.className} exceeds its group`)
              if (content.width < Math.min(300, Math.max(120, group.width - 128)))
                errors.push(`editing surface is too narrow: ${content.width}`)
            }
            return errors
          })
        }),
      { message: 'all visible workbench content fits its Dockview group' },
    )
    .toEqual([])
}

export const attachLayoutFixtureDiagnostics = async (session: RendererSession, info: TestInfo) => {
  await attachWorkbenchRoutes(session.page, info)
  await info.attach('workbench-native-groups.json', {
    body: JSON.stringify(
      await session.page.locator('.dv-groupview').evaluateAll((groups) =>
        groups.map((group) => ({
          label: group.getAttribute('aria-label'),
          tabs: [...group.querySelectorAll('[data-tab-panel-id]')].map((tab) => ({
            panelId: tab.getAttribute('data-tab-panel-id'),
            selected: tab.getAttribute('aria-selected'),
            title: tab.querySelector('[title]')?.getAttribute('title'),
          })),
          paneIds: [...group.querySelectorAll('[data-workbench-pane]')].map((pane) =>
            pane.getAttribute('data-workbench-pane'),
          ),
        })),
      ),
      null,
      2,
    ),
    contentType: 'application/json',
  })
  await info.attach('native-layout-fixture.json', {
    body: JSON.stringify(
      {
        layout: session.backend.workspaceLayout.read(),
        writes: session.backend.workspaceLayout.writes(),
        rejections: session.backend.workspaceLayout.rejections,
        reads: session.backend.workspaceLayout.reads,
        history: session.backend.workspaceLayout.history,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  })
}

const routeHistory = new WeakMap<Page, Array<{ time: number; url: string; activePane?: unknown }>>()
export const trackWorkbenchRoutes = (page: Page) => {
  const entries: Array<{ time: number; url: string; activePane?: unknown }> = []
  routeHistory.set(page, entries)
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    const entry: { time: number; url: string; activePane?: unknown } = {
      time: Date.now(),
      url: frame.url(),
    }
    entries.push(entry)
    void page
      .locator('[data-workbench-pane][data-pane-active="true"]')
      .evaluateAll((panes) =>
        panes.map((pane) => ({
          id: pane.getAttribute('data-workbench-pane'),
          text: pane.textContent?.slice(0, 150),
        })),
      )
      .then((value) => {
        entry.activePane = value
      })
      .catch(() => undefined)
  })
}
export const attachWorkbenchRoutes = async (page: Page, info: TestInfo) => {
  await info.attach('workbench-route-history.json', {
    body: JSON.stringify(routeHistory.get(page) ?? [], null, 2),
    contentType: 'application/json',
  })
}

export const workbenchGroupProportions = (page: Page) =>
  page.locator('.dv-groupview').evaluateAll((groups) => {
    const root = document.querySelector('.workbench-dock')!.getBoundingClientRect()
    return groups.map((group) => {
      const box = group.getBoundingClientRect()
      return {
        x: (box.x - root.x) / root.width,
        y: (box.y - root.y) / root.height,
        width: box.width / root.width,
        height: box.height / root.height,
      }
    })
  })
