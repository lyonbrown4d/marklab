/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { browser } from '@wdio/globals'
// eslint-disable-next-line no-restricted-imports -- Real native geometry; no ChromeDriver attach extension.
import { getNativeWindowRect, setNativeWindowRect } from './windowGeometry.ts'
/* eslint-disable no-restricted-imports -- Native rendering checks use the isolated E2E workspace. */
import { fixturePaths } from './fixturePaths.js'
import { openEditor, switchToWorkspace } from './nativeHarness.js'
/* eslint-enable no-restricted-imports */

describe('native renderer compatibility', () => {
  it('opens the terminal on demand and returns its space when closed', async () => {
    await switchToWorkspace(fixturePaths().alpha)
    await openEditor()
    const toggle = 'button[aria-pressed]:has(svg.lucide-terminal)'
    await browser.$(toggle).click()
    try {
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const terminal = document.querySelector('[data-app-focus-zone="terminal"]')
            return (terminal?.getBoundingClientRect().height ?? 0) >= 120
          }),
        { timeoutMsg: 'Requested terminal never expanded' },
      )
    } finally {
      await browser.$(toggle).click()
    }
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const terminal = document.querySelector('[data-app-focus-zone="terminal"]')
          return (terminal?.getBoundingClientRect().height ?? Infinity) <= 1
        }),
      { timeoutMsg: 'Closed terminal retained empty drawer space' },
    )
  })

  it('renders editor and titlebar within the viewport at desktop and narrow sizes', async () => {
    await switchToWorkspace(fixturePaths().alpha)
    await openEditor()
    const original = await getNativeWindowRect()
    const artifacts = path.resolve('test-results/tauri/rendering')
    await fs.mkdir(artifacts, { recursive: true })
    try {
      for (const width of [1440, 900, 640]) {
        await setNativeWindowRect(120, 140, width, 800)
        await browser.execute(async () => {
          await document.fonts.ready
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        })
        const metrics = await browser.execute(() => {
          const measure = (selector: string) => {
            const element = document.querySelector(selector)
            if (!element) throw new Error(`Missing rendering surface: ${selector}`)
            const box = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
              x: box.x,
              y: box.y,
              right: box.right,
              width: box.width,
              height: box.height,
              font: style.fontFamily,
              color: style.color,
              background: style.backgroundColor,
            }
          }
          return {
            language: navigator.language,
            userAgent: navigator.userAgent,
            viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio },
            documentWidth: document.documentElement.scrollWidth,
            editor: measure('[data-testid="markdown-editor"]'),
            titlebar: measure('[data-app-focus-zone="titlebar"]'),
            terminal: measure('[data-app-focus-zone="terminal"]'),
            css: {
              oklch: CSS.supports('color', 'oklch(0.5 0.1 120)'),
              colorMix: CSS.supports('color', 'color-mix(in srgb, red, blue)'),
              backdropFilter: CSS.supports('backdrop-filter', 'blur(16px)'),
              containerQueries: CSS.supports('container-type', 'inline-size'),
            },
          }
        })
        await fs.writeFile(path.join(artifacts, `${width}.json`), JSON.stringify(metrics, null, 2))
        await browser.saveScreenshot(path.join(artifacts, `${width}.png`))
        assert.ok(
          metrics.documentWidth <= metrics.viewport.width + 1,
          'Document overflows viewport',
        )
        assert.ok(metrics.terminal.height <= 1, 'Closed terminal reserves visible drawer space')
        for (const [name, surface] of [
          ['editor', metrics.editor],
          ['titlebar', metrics.titlebar],
        ] as const) {
          assert.ok(surface.width > 0 && surface.height > 0, `${name} has no visible layout`)
          assert.ok(surface.x >= -1, `${name} extends beyond the left edge`)
          assert.ok(surface.right <= metrics.viewport.width + 1, `${name} exceeds the right edge`)
        }
        for (const [feature, supported] of Object.entries(metrics.css)) {
          assert.equal(supported, true, `Theme CSS feature unavailable: ${feature}`)
        }
      }
    } finally {
      await setNativeWindowRect(original.x, original.y, original.width, original.height)
    }
  })
})
